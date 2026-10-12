import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
  ScheduledEvent,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { env } from '$amplify/env/group-events';
import { hasAnyRole } from '../../../src/app/core/auth/roles';
import { type EmailKind, eventEmail } from '../../../src/app/core/events/event-email';
import {
  canManage,
  DEFAULT_TIME_ZONE,
  dueReminders,
  type EventDate,
  type EventInput,
  type EventOption,
  type GroupEvent,
  type Member,
  type Reminder,
  type Rsvp,
  skipPastReminders,
  validateEventInput,
  type Vote,
} from '../../../src/app/core/events/events';
import { callerGroups, json } from '../shared/http';

const TABLE = process.env['EVENTS_TABLE']!;
const USER_POOL_ID = process.env['USER_POOL_ID']!;
/** Everyone in these groups is a member: gets emails and appears in polls. */
const MEMBER_GROUPS = ['neia-boiz', 'admin'];

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESv2Client({});

type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;

interface Caller {
  id: string;
  isAdmin: boolean;
}

interface MemberRecord extends Member {
  email: string;
  hasName: boolean;
}

/**
 * HTTP API (NEIA Boiz members; admins always pass):
 *   GET  /events               → overview: me, members, all events
 *   POST /events               → create (EventInput)
 *   PUT  /events/profile       → { name } my display name
 *   GET  /events/{id}          → one event
 *   PUT  /events/{id}          → edit (EventInput), creator or admin
 *   PUT  /events/{id}/votes    → { votes: { optionId: yes|maybe|no } } mine
 *   POST /events/{id}/confirm  → { optionId }, creator or admin
 *   POST /events/{id}/cancel   → creator or admin
 *   PUT  /events/{id}/rsvp     → { rsvp: going|maybe|no } mine
 *
 * Also invoked every 15 minutes by EventBridge to send due reminders.
 */
export const handler = async (event: ApiEvent | ScheduledEvent): Promise<Result | void> => {
  if (!('rawPath' in event)) return sendDueReminders(new Date());

  const groups = callerGroups(event);
  if (!hasAnyRole(groups, ['neia-boiz']))
    return json(403, { message: "You don't have access to events." });
  const caller: Caller = {
    id: String(event.requestContext.authorizer.jwt.claims['sub']),
    isAdmin: groups.includes('admin'),
  };

  try {
    return await route(event, caller);
  } catch (error) {
    console.error(error);
    return json(502, { message: 'Something went wrong. Please try again.' });
  }
};

async function route(event: ApiEvent, caller: Caller): Promise<Result> {
  const method = event.requestContext.http.method;
  const [, , id, action] = event.rawPath.split('/'); // "", "events", id, action
  const body = parseBody(event.body);

  if (!id) {
    if (method === 'GET') return json(200, await overview(caller));
    if (method === 'POST') return create(caller, body);
  } else if (id === 'profile' && method === 'PUT') {
    return setName(caller, body);
  } else if (!action) {
    if (method === 'GET') return detail(caller, id);
    if (method === 'PUT') return edit(caller, id, body);
  } else if (action === 'votes' && method === 'PUT') {
    return vote(caller, id, body);
  } else if (action === 'rsvp' && method === 'PUT') {
    return rsvp(caller, id, body);
  } else if (action === 'confirm' && method === 'POST') {
    return confirm(caller, id, body);
  } else if (action === 'cancel' && method === 'POST') {
    return cancel(caller, id);
  }
  return json(404, { message: 'Not found' });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function overview(caller: Caller) {
  const [events, members] = await Promise.all([loadEvents(), loadMembers()]);
  return {
    me: me(caller, members),
    members: publicMembers(members),
    events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

async function detail(caller: Caller, id: string): Promise<Result> {
  const [event, members] = await Promise.all([loadEvent(id), loadMembers()]);
  if (!event) return json(404, { message: 'Event not found' });
  return json(200, { me: me(caller, members), members: publicMembers(members), event });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function create(caller: Caller, body: Record<string, unknown>): Promise<Result> {
  const error = validateEventInput(body);
  if (error) return json(400, { message: error });
  const input = body as unknown as EventInput;
  const now = new Date();

  const options = input.options.map((date) => ({ id: newId(), ...cleanDate(date) }));
  const confirmed = input.confirmNow ? cleanDate(input.options[0]) : null;
  const reminders = reminderList(input.reminderOffsets, []);
  const event: GroupEvent = {
    id: newId(),
    title: input.title.trim(),
    details: input.details.trim(),
    location: cleanLocation(input.location),
    timeZone: DEFAULT_TIME_ZONE,
    status: confirmed ? 'confirmed' : 'polling',
    createdBy: caller.id,
    createdAt: now.toISOString(),
    options,
    votes: {},
    confirmed,
    rsvps: confirmed ? { [caller.id]: 'going' } : {},
    reminders: confirmed
      ? skipPastReminders(reminders, confirmed, DEFAULT_TIME_ZONE, now)
      : reminders,
  };
  await db.send(
    new PutCommand({ TableName: TABLE, Item: { pk: eventKey(event.id), type: 'event', ...event } }),
  );
  await notify(confirmed ? 'confirmed' : 'poll', event, caller);
  return json(201, event);
}

async function edit(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const existing = await loadEvent(id);
  if (!existing) return json(404, { message: 'Event not found' });
  if (!canManage(existing, caller.id, caller.isAdmin)) return forbidden();
  if (existing.status === 'cancelled') return json(409, { message: 'This event was cancelled.' });
  const error = validateEventInput(body);
  if (error) return json(400, { message: error });
  const input = body as unknown as EventInput;
  const now = new Date();

  // Keep option ids (and so their votes) for dates that didn't change
  const options: EventOption[] = input.options.map((date) => {
    const clean = cleanDate(date);
    const same = existing.options.find((o) => sameDate(o, clean));
    return { id: same?.id ?? newId(), ...clean };
  });
  let confirmed = existing.confirmed;
  if (existing.status === 'confirmed' || input.confirmNow) confirmed = cleanDate(input.options[0]);
  const dateChanged =
    !!existing.confirmed && !!confirmed && !sameDate(existing.confirmed, confirmed);
  const newlyConfirmed = existing.status === 'polling' && input.confirmNow;

  let reminders = reminderList(input.reminderOffsets, dateChanged ? [] : existing.reminders);
  if (confirmed && (dateChanged || newlyConfirmed)) {
    reminders = skipPastReminders(reminders, confirmed, existing.timeZone, now);
  }
  const updated: GroupEvent = {
    ...existing,
    title: input.title.trim(),
    details: input.details.trim(),
    location: cleanLocation(input.location),
    options,
    confirmed,
    status: confirmed ? 'confirmed' : 'polling',
    reminders,
  };
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression:
        'SET title = :title, details = :details, #location = :location, #options = :options, confirmed = :confirmed, #status = :status, reminders = :reminders',
      ConditionExpression: 'attribute_exists(pk) AND #status <> :cancelled',
      ExpressionAttributeNames: {
        '#location': 'location',
        '#options': 'options',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':title': updated.title,
        ':details': updated.details,
        ':location': updated.location,
        ':options': updated.options,
        ':confirmed': updated.confirmed,
        ':status': updated.status,
        ':reminders': updated.reminders,
        ':cancelled': 'cancelled',
      },
    }),
  );
  if (newlyConfirmed) await notify('confirmed', updated, caller);
  else if (dateChanged) await notify('updated', updated, caller);
  return json(200, updated);
}

async function vote(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const event = await loadEvent(id);
  if (!event) return json(404, { message: 'Event not found' });
  if (event.status !== 'polling')
    return json(409, { message: 'Voting has closed for this event.' });
  const raw = (body['votes'] ?? {}) as Record<string, unknown>;
  const votes: Record<string, Vote> = {};
  for (const option of event.options) {
    const answer = raw[option.id];
    if (answer === 'yes' || answer === 'maybe' || answer === 'no') votes[option.id] = answer;
  }
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET votes.#me = :votes',
      ConditionExpression: '#status = :polling',
      ExpressionAttributeNames: { '#me': caller.id, '#status': 'status' },
      ExpressionAttributeValues: { ':votes': votes, ':polling': 'polling' },
    }),
  );
  return json(200, { votes });
}

async function rsvp(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const answer = body['rsvp'];
  if (answer !== 'going' && answer !== 'maybe' && answer !== 'no') {
    return json(400, { message: 'Invalid RSVP' });
  }
  const event = await loadEvent(id);
  if (!event) return json(404, { message: 'Event not found' });
  if (event.status !== 'confirmed') return json(409, { message: "This event isn't confirmed." });
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET rsvps.#me = :rsvp',
      ExpressionAttributeNames: { '#me': caller.id },
      ExpressionAttributeValues: { ':rsvp': answer satisfies Rsvp },
    }),
  );
  return json(200, { rsvp: answer });
}

async function confirm(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const event = await loadEvent(id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  if (event.status !== 'polling') return json(409, { message: 'This event is no longer polling.' });
  const option = event.options.find((o) => o.id === body['optionId']);
  if (!option) return json(400, { message: 'Pick one of the proposed dates.' });

  const { id: _, ...when } = option;
  const reminders = skipPastReminders(event.reminders, when, event.timeZone, new Date());
  // Everyone who said yes to the chosen date starts out as going
  const rsvps: Record<string, Rsvp> = {};
  for (const [member, answers] of Object.entries(event.votes)) {
    if (answers[option.id] === 'yes') rsvps[member] = 'going';
  }
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression:
        'SET #status = :confirmed, confirmed = :when, reminders = :reminders, rsvps = :rsvps',
      ConditionExpression: '#status = :polling',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':confirmed': 'confirmed',
        ':polling': 'polling',
        ':when': when,
        ':reminders': reminders,
        ':rsvps': rsvps,
      },
    }),
  );
  const confirmed: GroupEvent = {
    ...event,
    status: 'confirmed',
    confirmed: when,
    reminders,
    rsvps,
  };
  await notify('confirmed', confirmed, caller);
  return json(200, confirmed);
}

async function cancel(caller: Caller, id: string): Promise<Result> {
  const event = await loadEvent(id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  if (event.status === 'cancelled') return json(200, event);
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET #status = :cancelled',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':cancelled': 'cancelled' },
    }),
  );
  const cancelled: GroupEvent = { ...event, status: 'cancelled' };
  await notify('cancelled', cancelled, caller);
  return json(200, cancelled);
}

async function setName(caller: Caller, body: Record<string, unknown>): Promise<Result> {
  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  if (!name || name.length > 40) return json(400, { message: 'Use a name of 1–40 characters.' });
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `profile#${caller.id}`, type: 'profile', name },
    }),
  );
  membersCache = null;
  return json(200, { name });
}

// ---------------------------------------------------------------------------
// Reminders (scheduled)
// ---------------------------------------------------------------------------

async function sendDueReminders(now: Date): Promise<void> {
  const events = await loadEvents();
  for (const event of events) {
    for (const index of dueReminders(event, now)) {
      // Claim the reminder first, so overlapping runs never send it twice
      try {
        await db.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { pk: eventKey(event.id) },
            UpdateExpression: `SET reminders[${index}].sentAt = :now`,
            ConditionExpression: `attribute_not_exists(reminders[${index}].sentAt) AND #status = :confirmed`,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':now': now.toISOString(), ':confirmed': 'confirmed' },
          }),
        );
      } catch (error) {
        if ((error as { name?: string }).name === 'ConditionalCheckFailedException') continue;
        throw error;
      }
      await notify('reminder', event, null, event.reminders[index].offsetMinutes);
    }
  }
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Emails every member about the event, one message each (addresses stay
 * private). Skips whoever made the change; reminders skip people who can't come.
 * A failed send (e.g. while SES is in its sandbox) is logged, not fatal.
 */
async function notify(
  kind: EmailKind,
  event: GroupEvent,
  actor: Caller | null,
  reminderOffset?: number,
) {
  const members = await loadMembers();
  const by = actor ? members.find((m) => m.id === actor.id)?.name : undefined;
  const email = eventEmail(kind, event, `${env.SITE_URL}/events/${event.id}`, {
    by,
    reminderOffset,
  });
  const recipients = members.filter(
    (m) => m.id !== actor?.id && !(kind === 'reminder' && event.rsvps[m.id] === 'no'),
  );
  const results = await Promise.allSettled(
    recipients.map((member) =>
      ses.send(
        new SendEmailCommand({
          FromEmailAddress: env.MAIL_FROM,
          Destination: { ToAddresses: [member.email] },
          Content: {
            Simple: {
              Subject: { Data: email.subject },
              Body: { Text: { Data: email.text }, Html: { Data: email.html } },
            },
          },
        }),
      ),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`Could not email member ${recipients[i].id} (${kind}):`, String(result.reason));
    }
  });
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

const eventKey = (id: string) => `event#${id}`;

async function loadEvent(id: string): Promise<GroupEvent | null> {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: eventKey(id) } }));
  return Item ? toEvent(Item) : null;
}

async function scanAll(): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function loadEvents(): Promise<GroupEvent[]> {
  return (await scanAll()).filter((item) => item['type'] === 'event').map(toEvent);
}

function toEvent(item: Record<string, unknown>): GroupEvent {
  const { pk: _, type: __, ...event } = item;
  return event as unknown as GroupEvent;
}

let membersCache: { at: number; members: MemberRecord[] } | null = null;

/** Members of the member groups with their display names (cached briefly). */
async function loadMembers(): Promise<MemberRecord[]> {
  if (membersCache && Date.now() - membersCache.at < 5 * 60_000) return membersCache.members;

  const [users, items] = await Promise.all([
    Promise.all(MEMBER_GROUPS.map(listGroup)).then((lists) => lists.flat()),
    scanAll(),
  ]);
  const names = new Map(
    items
      .filter((item) => item['type'] === 'profile')
      .map((item) => [String(item['pk']).slice('profile#'.length), String(item['name'])]),
  );
  const byId = new Map<string, MemberRecord>();
  for (const user of users) {
    const attr = (name: string) => user.Attributes?.find((a) => a.Name === name)?.Value ?? '';
    const id = attr('sub');
    const email = attr('email');
    if (!id || !email || !user.Enabled || byId.has(id)) continue;
    const name = names.get(id);
    byId.set(id, { id, email, name: name ?? email.split('@')[0], hasName: !!name });
  }
  const members = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  membersCache = { at: Date.now(), members };
  return members;
}

async function listGroup(group: string): Promise<UserType[]> {
  const users: UserType[] = [];
  let NextToken: string | undefined;
  do {
    const page = await cognito.send(
      new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: group, NextToken }),
    );
    users.push(...(page.Users ?? []));
    NextToken = page.NextToken;
  } while (NextToken);
  return users;
}

/** Names only: members never see each other's email addresses. */
const publicMembers = (members: MemberRecord[]): Member[] =>
  members.map(({ id, name }) => ({ id, name }));

function me(caller: Caller, members: MemberRecord[]) {
  const record = members.find((m) => m.id === caller.id);
  return {
    id: caller.id,
    name: record?.name ?? 'You',
    hasName: record?.hasName ?? false,
    isAdmin: caller.isAdmin,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newId = () => randomUUID().replace(/-/g, '').slice(0, 12);

function cleanDate(date: EventDate): EventDate {
  return {
    date: date.date,
    ...(date.startTime ? { startTime: date.startTime } : {}),
    ...(date.startTime && date.endTime ? { endTime: date.endTime } : {}),
  };
}

const sameDate = (a: EventDate, b: EventDate) =>
  a.date === b.date &&
  (a.startTime ?? '') === (b.startTime ?? '') &&
  (a.endTime ?? '') === (b.endTime ?? '');

function cleanLocation(location: EventInput['location']): GroupEvent['location'] {
  const name = location?.name?.trim();
  if (!name) return null;
  const address = location?.address?.trim();
  return { name, ...(address ? { address } : {}) };
}

/** The new reminder offsets, keeping the sent state of ones that already existed. */
function reminderList(offsets: number[], existing: Reminder[]): Reminder[] {
  return [...new Set(offsets)]
    .sort((a, b) => b - a)
    .map(
      (offsetMinutes) =>
        existing.find((r) => r.offsetMinutes === offsetMinutes) ?? { offsetMinutes },
    );
}

function parseBody(body: string | undefined): Record<string, unknown> {
  try {
    const parsed = body ? JSON.parse(body) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const forbidden = () => json(403, { message: 'Only the organizer can change this event.' });
