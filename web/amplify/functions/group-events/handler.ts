import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$amplify/env/group-events';
import { hasAnyRole } from '../../../src/app/core/auth/roles';
import {
  type CommentInput,
  type EventComment,
  isReactionKey,
  REACTIONS,
  type ReactionKey,
  type SuggestionStatus,
  validateCommentInput,
} from '../../../src/app/core/events/comments';
import {
  type CommentEmailKind,
  commentEmail,
  type Email,
  type EmailKind,
  eventEmail,
  memberJoinedEmail,
  pollClosedEmail,
  type PollResult,
  type RecipientLinks,
} from '../../../src/app/core/events/event-email';
import {
  AVATAR_MAX_BYTES,
  type EmailPrefs,
  NO_EMAILS,
  normalizePrefs,
  wantsEmail,
} from '../../../src/app/core/events/profile';
import {
  type Attachment,
  type AttachmentKind,
  bestOptionIds,
  calendarFeedIcs,
  canJoin,
  canLeave,
  canManage,
  canSee,
  DEFAULT_TIME_ZONE,
  dueReminders,
  formatDeadline,
  formatEventDate,
  pollJustClosed,
  restoredStatus,
  scoreOptions,
  type EventDate,
  type EventInput,
  type EventOption,
  type GroupEvent,
  invitedMembers,
  isInvited,
  type Member,
  type Reminder,
  type Rsvp,
  skipPastReminders,
  validateEventInput,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_IMAGE_BYTES,
  safeFileName,
  validateUploadRequest,
  type Vote,
  type VoteDeadline,
  voteDeadline,
  votingOpen,
} from '../../../src/app/core/events/events';
import { callerGroups, json } from '../shared/http';

const TABLE = process.env['EVENTS_TABLE']!;
const AVATAR_BUCKET = process.env['AVATAR_BUCKET']!;
const USER_POOL_ID = process.env['USER_POOL_ID']!;
/** Everyone in these groups is a member: gets emails and appears in polls. */
const MEMBER_GROUPS = ['neia-boiz', 'admin'];
/** GSI over comment items: eventId + createdAt (backend.ts). */
const COMMENTS_INDEX = 'byEvent';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESv2Client({});
const s3 = new S3Client({});

type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;

interface Caller {
  id: string;
  isAdmin: boolean;
}

interface MemberRecord extends Member {
  email: string;
  hasName: boolean;
  prefs: EmailPrefs;
  avatarKey: string | null;
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
 *   POST /events/{id}/restore  → { notify } creator or admin; back to what it was
 *   POST /events/{id}/join     → add myself to a visible event's invite list (emails the organizer)
 *   POST /events/{id}/leave    → take myself off the invite list (votes and RSVP removed)
 *   PUT  /events/{id}/rsvp     → { rsvp: going|maybe|no } mine
 *   POST /events/{id}/comments → CommentInput (emails the organizer, or the parent's author)
 *   DELETE /events/{id}/comments/{cid}           → author, organizer or admin
 *   PUT  /events/{id}/comments/{cid}/reactions   → { reaction, on } mine
 *   PUT  /events/{id}/comments/{cid}/status      → { status } suggestions; organizer or admin
 *   POST /events/{id}/attachments               → UploadRequest → { id, name, uploadUrl } (organizer/admin)
 *   PUT  /events/{id}/attachments/{aid}         → { kind, name, type } after the upload: attaches it
 *   DELETE /events/{id}/attachments/{aid}       → removes the cover image or a file
 *
 *   GET  /events/profile        → my profile (name, email, photo, email preferences)
 *   PUT  /events/profile        → { name?, prefs? }
 *   PUT  /events/profile/avatar → { image: JPEG data URL }; DELETE removes it
 *   POST /unsubscribe           → { m, t } signed link from an email; no login needed
 *   GET  /calendar/{member}/{token}.ics → that member's calendar subscription; no login needed
 *
 * Also invoked every 15 minutes by EventBridge to send due reminders.
 */
export const handler = async (event: ApiEvent | ScheduledEvent): Promise<Result | void> => {
  if (!('rawPath' in event)) return sendDueReminders(new Date());
  // The only route without a login: the signed link in every email
  if (event.rawPath === '/unsubscribe') return unsubscribe(parseBody(event.body));
  if (event.rawPath.startsWith('/calendar/')) return calendarFeed(event.rawPath);

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
  // "", "events", id, action, commentId, commentAction
  const [, , id, action, commentId, commentAction] = event.rawPath.split('/');
  const body = parseBody(event.body);

  if (!id) {
    if (method === 'GET') return json(200, await overview(caller));
    if (method === 'POST') return create(caller, body);
  } else if (id === 'profile') {
    if (!action && method === 'GET') return json(200, await profile(caller));
    if (!action && method === 'PUT') return updateProfile(caller, body);
    if (action === 'avatar' && method === 'PUT') return setAvatar(caller, body);
    if (action === 'avatar' && method === 'DELETE') return removeAvatar(caller);
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
  } else if (action === 'restore' && method === 'POST') {
    return restore(caller, id, body);
  } else if (action === 'join' && method === 'POST') {
    return join(caller, id);
  } else if (action === 'leave' && method === 'POST') {
    return leave(caller, id);
  } else if (action === 'attachments') {
    const attachmentId = commentId;
    if (!attachmentId && method === 'POST') return requestUpload(caller, id, body);
    if (attachmentId && method === 'PUT') return confirmUpload(caller, id, attachmentId, body);
    if (attachmentId && method === 'DELETE') return removeAttachment(caller, id, attachmentId);
  } else if (action === 'comments') {
    if (!commentId && method === 'POST') return addComment(caller, id, body);
    if (commentId && !commentAction && method === 'DELETE')
      return deleteComment(caller, id, commentId);
    if (commentAction === 'reactions' && method === 'PUT')
      return react(caller, id, commentId, body);
    if (commentAction === 'status' && method === 'PUT')
      return setStatus(caller, id, commentId, body);
  }
  return json(404, { message: 'Not found' });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function overview(caller: Caller) {
  const [events, members] = await Promise.all([loadEvents(), loadMembers()]);
  return {
    me: await me(caller, members),
    members: await publicMembers(members),
    events: await Promise.all(
      events
        .filter((e) => canSee(e, caller.id, caller.isAdmin))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(withFileLinks),
    ),
  };
}

async function detail(caller: Caller, id: string): Promise<Result> {
  const [event, members, comments] = await Promise.all([
    loadVisibleEvent(caller, id),
    loadMembers(),
    loadComments(id),
  ]);
  if (!event) return json(404, { message: 'Event not found' });
  return json(200, {
    me: await me(caller, members),
    members: await publicMembers(members),
    event: await withFileLinks(event),
    comments,
  });
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
  const invitees = await cleanInvitees(input.invitees, caller.id);
  if (invitees && !invitees.length) {
    return json(400, { message: 'Pick at least one person to invite, or invite everyone.' });
  }
  const voteBy = confirmed ? null : cleanVoteBy(input.voteBy);
  if (voteBy && deadlinePassed(voteBy, DEFAULT_TIME_ZONE, now)) {
    return json(400, { message: 'Pick a voting deadline in the future.' });
  }
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
    invitees,
    inviteesOnly: !!invitees && input.inviteesOnly,
    voteBy,
  };
  await db.send(
    new PutCommand({ TableName: TABLE, Item: { pk: eventKey(event.id), type: 'event', ...event } }),
  );
  await notify(confirmed ? 'confirmed' : 'poll', event, caller);
  return json(201, event);
}

async function edit(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const existing = await loadVisibleEvent(caller, id);
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

  const invitees = await cleanInvitees(input.invitees, existing.createdBy);
  if (invitees && !invitees.length) {
    return json(400, { message: 'Pick at least one person to invite, or invite everyone.' });
  }
  // A deadline only matters while polling; changing it reopens voting
  const stillPolling = existing.status === 'polling' && !input.confirmNow;
  const voteBy = stillPolling ? cleanVoteBy(input.voteBy) : null;
  const deadlineChanged = JSON.stringify(voteBy) !== JSON.stringify(existing.voteBy ?? null);
  if (deadlineChanged && voteBy && deadlinePassed(voteBy, existing.timeZone, now)) {
    return json(400, { message: 'Pick a voting deadline in the future.' });
  }

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
    invitees,
    inviteesOnly: !!invitees && input.inviteesOnly,
    voteBy,
    voteClosedNotified: deadlineChanged ? null : (existing.voteClosedNotified ?? null),
  };
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression:
        'SET title = :title, details = :details, #location = :location, #options = :options, confirmed = :confirmed, #status = :status, reminders = :reminders, invitees = :invitees, inviteesOnly = :inviteesOnly, voteBy = :voteBy, voteClosedNotified = :voteClosedNotified',
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
        ':invitees': updated.invitees,
        ':inviteesOnly': updated.inviteesOnly,
        ':voteBy': updated.voteBy,
        ':voteClosedNotified': updated.voteClosedNotified,
        ':cancelled': 'cancelled',
      },
    }),
  );
  if (newlyConfirmed) await notify('confirmed', updated, caller);
  else if (dateChanged) await notify('updated', updated, caller);
  else {
    // People added to the list get the invitation they missed
    const members = await loadMembers();
    const added = members
      .filter((m) => isInvited(updated, m.id) && !isInvited(existing, m.id))
      .map((m) => m.id);
    if (added.length) {
      await notify(
        updated.status === 'polling' ? 'poll' : 'confirmed',
        updated,
        caller,
        undefined,
        new Set(added),
      );
    }
  }
  return json(200, updated);
}

async function vote(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!votingOpen(event)) {
    return json(409, {
      message:
        event.status === 'polling' && event.voteBy
          ? `Voting closed ${formatDeadline(event.voteBy)}.`
          : 'Voting has closed for this event.',
    });
  }
  if (!isInvited(event, caller.id)) return notInvited();
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
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (event.status !== 'confirmed') return json(409, { message: "This event isn't confirmed." });
  if (!isInvited(event, caller.id)) return notInvited();
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
  const event = await loadVisibleEvent(caller, id);
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
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  if (event.status === 'cancelled') return json(200, event);
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET #status = :cancelled, cancelledFrom = :from',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':cancelled': 'cancelled', ':from': event.status },
    }),
  );
  const cancelled: GroupEvent = { ...event, status: 'cancelled', cancelledFrom: event.status };
  await notify('cancelled', cancelled, caller);
  return json(200, cancelled);
}

/**
 * Un-cancels an event, back to a poll (votes kept) or a confirmed event (date
 * and RSVPs kept). Reminders that came due while it was cancelled are skipped.
 * With notify, everyone who wants event updates gets a "back on" email.
 */
/** Adds the caller to a visible event's invite list, and tells the organizer. */
async function join(caller: Caller, id: string): Promise<Result> {
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canJoin(event, caller.id)) {
    return json(409, {
      message: isInvited(event, caller.id)
        ? "You're already in."
        : "This event isn't open to join.",
    });
  }
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: eventKey(id) },
        UpdateExpression: 'SET invitees = list_append(invitees, :me)',
        // Re-checked here in case the organizer changed the event meanwhile
        ConditionExpression:
          'attribute_exists(invitees) AND NOT contains(invitees, :id) AND inviteesOnly <> :true AND #status <> :cancelled',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':me': [caller.id],
          ':id': caller.id,
          ':true': true,
          ':cancelled': 'cancelled',
        },
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(409, { message: "This event isn't open to join anymore." });
    }
    throw error;
  }
  const joined: GroupEvent = { ...event, invitees: [...event.invitees!, caller.id] };

  const members = await loadMembers(true);
  const organizer = members.find((m) => m.id === event.createdBy);
  if (organizer && organizer.id !== caller.id && wantsEmail(organizer.prefs, 'joined')) {
    const name = members.find((m) => m.id === caller.id)?.name ?? 'Someone';
    await sendEmail(
      organizer,
      memberJoinedEmail(
        event,
        name,
        invitedMembers(joined, members).length,
        `${env.SITE_URL}/events/${id}`,
        await recipientLinks(organizer.id),
      ),
      'joined',
    );
  }
  return json(200, await withFileLinks(joined));
}

/** Takes the caller off the invite list, removing their votes and RSVP so they stop counting. */
async function leave(caller: Caller, id: string): Promise<Result> {
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canLeave(event, caller.id)) return json(409, { message: "You can't leave this event." });
  const invitees = event.invitees!.filter((m) => m !== caller.id);
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET invitees = :invitees REMOVE votes.#me, rsvps.#me',
      ConditionExpression: 'contains(invitees, :id)',
      ExpressionAttributeNames: { '#me': caller.id },
      ExpressionAttributeValues: { ':invitees': invitees, ':id': caller.id },
    }),
  );
  const votes = { ...event.votes };
  const rsvps = { ...event.rsvps };
  delete votes[caller.id];
  delete rsvps[caller.id];
  return json(200, await withFileLinks({ ...event, invitees, votes, rsvps }));
}

async function restore(caller: Caller, id: string, body: Record<string, unknown>): Promise<Result> {
  const event = await loadVisibleEvent(caller, id);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  if (event.status !== 'cancelled') return json(409, { message: "This event isn't cancelled." });

  const status = restoredStatus(event);
  const reminders =
    status === 'confirmed' && event.confirmed
      ? skipPastReminders(event.reminders, event.confirmed, event.timeZone, new Date())
      : event.reminders;
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: eventKey(id) },
      UpdateExpression: 'SET #status = :status, reminders = :reminders REMOVE cancelledFrom',
      ConditionExpression: '#status = :cancelled',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':reminders': reminders,
        ':cancelled': 'cancelled',
      },
    }),
  );
  const restored: GroupEvent = { ...event, status, reminders, cancelledFrom: null };
  if (body['notify'] === true) await notify('restored', restored, caller);
  return json(200, restored);
}

// ---------------------------------------------------------------------------
// Attachments: a cover image and up to MAX_FILES files, in the private bucket.
// The browser uploads straight to S3 with a signed link (to pending/, which a
// lifecycle rule empties after a day), then confirms; only then is the file
// moved under events/ and attached.
// ---------------------------------------------------------------------------

const pendingKey = (eventId: string, id: string, name: string) =>
  `pending/${eventId}/${id}/${name}`;
const fileKey = (eventId: string, id: string, name: string) => `events/${eventId}/${id}/${name}`;

async function requestUpload(
  caller: Caller,
  eventId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const event = await loadVisibleEvent(caller, eventId);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  const error = validateUploadRequest(body, event.attachments?.length ?? 0);
  if (error) return json(400, { message: error });

  const id = newId();
  const name = safeFileName(String(body['name']));
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: AVATAR_BUCKET,
      Key: pendingKey(eventId, id, name),
      ContentType: String(body['type']),
      ContentLength: Number(body['size']),
    }),
    { expiresIn: 15 * 60 },
  );
  return json(200, { id, name, uploadUrl });
}

async function confirmUpload(
  caller: Caller,
  eventId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const event = await loadVisibleEvent(caller, eventId);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  const kind = body['kind'] as AttachmentKind;
  if ((kind !== 'image' && kind !== 'file') || !/^[a-f0-9]{12}$/.test(id)) {
    return json(400, { message: 'Invalid upload' });
  }
  const name = safeFileName(String(body['name'] ?? ''));
  const from = pendingKey(eventId, id, name);

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: AVATAR_BUCKET, Key: from }));
  } catch {
    return json(404, { message: "The upload didn't finish. Please try again." });
  }
  const size = head.ContentLength ?? 0;
  const type = head.ContentType ?? 'application/octet-stream';
  if (size > (kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
    await deleteObject(from);
    return json(400, { message: 'That file is too large.' });
  }

  const key = fileKey(eventId, id, name);
  await s3.send(
    new CopyObjectCommand({
      Bucket: AVATAR_BUCKET,
      CopySource: `${AVATAR_BUCKET}/${encodeURIComponent(from).replace(/%2F/g, '/')}`,
      Key: key,
    }),
  );
  await deleteObject(from);
  const attachment: Attachment = {
    id,
    name,
    size,
    type,
    key,
    uploadedAt: new Date().toISOString(),
  };

  try {
    if (kind === 'image') {
      await db.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk: eventKey(eventId) },
          UpdateExpression: 'SET image = :image',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':image': attachment },
        }),
      );
      if (event.image?.key) await deleteObject(event.image.key); // replaced
    } else {
      await db.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk: eventKey(eventId) },
          UpdateExpression:
            'SET attachments = list_append(if_not_exists(attachments, :empty), :file)',
          // Re-checked here so two uploads at once can't pass the limit
          ConditionExpression: 'attribute_not_exists(attachments) OR size(attachments) < :max',
          ExpressionAttributeValues: { ':empty': [], ':file': [attachment], ':max': MAX_FILES },
        }),
      );
    }
  } catch (error) {
    await deleteObject(key);
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(409, { message: `An event can have up to ${MAX_FILES} files.` });
    }
    throw error;
  }
  const updated = await loadEvent(eventId);
  return json(200, updated ? await withFileLinks(updated) : null);
}

async function removeAttachment(caller: Caller, eventId: string, id: string): Promise<Result> {
  const event = await loadVisibleEvent(caller, eventId);
  if (!event) return json(404, { message: 'Event not found' });
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();

  let removed: Attachment | undefined;
  if (event.image?.id === id) {
    removed = event.image;
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: eventKey(eventId) },
        UpdateExpression: 'REMOVE image',
      }),
    );
  } else {
    const files = event.attachments ?? [];
    removed = files.find((f) => f.id === id);
    if (!removed) return json(404, { message: 'Attachment not found' });
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: eventKey(eventId) },
        UpdateExpression: 'SET attachments = :files',
        ExpressionAttributeValues: { ':files': files.filter((f) => f.id !== id) },
      }),
    );
  }
  if (removed?.key) await deleteObject(removed.key);
  const updated = await loadEvent(eventId);
  return json(200, updated ? await withFileLinks(updated) : null);
}

async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: AVATAR_BUCKET, Key: key })).catch((error) => {
    console.warn('Could not delete', key, String(error));
  });
}

/** The event with signed links: the image to show inline, files to download by name. */
async function withFileLinks(event: GroupEvent): Promise<GroupEvent> {
  const link = async (file: Attachment, download: boolean) => ({
    ...file,
    url: await signedFileUrl(file.key!, download ? file.name : null),
  });
  return {
    ...event,
    image: event.image?.key ? await link(event.image, false) : (event.image ?? null),
    attachments: await Promise.all(
      (event.attachments ?? []).filter((f) => f.key).map((f) => link(f, true)),
    ),
  };
}

/** Like avatarUrl, but files download under their own name. */
async function signedFileUrl(key: string, downloadName: string | null): Promise<string> {
  const window = 6 * 60 * 60 * 1000;
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: AVATAR_BUCKET,
      Key: key,
      ...(downloadName
        ? {
            ResponseContentDisposition: `attachment; filename="${downloadName.replace(/"/g, '')}"`,
          }
        : {}),
    }),
    { expiresIn: 12 * 60 * 60, signingDate: new Date(Math.floor(Date.now() / window) * window) },
  );
}

async function profile(caller: Caller) {
  return {
    ...(await me(caller, await loadMembers(true))),
    // The client builds the feed URL from its API base: /calendar/{id}/{token}.ics
    calendarToken: await signedToken('calendar', caller.id),
  };
}

async function updateProfile(caller: Caller, body: Record<string, unknown>): Promise<Result> {
  const sets: string[] = ['#type = :profile'];
  const values: Record<string, unknown> = { ':profile': 'profile' };
  if ('name' in body) {
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!name || name.length > 40) return json(400, { message: 'Use a name of 1–40 characters.' });
    sets.push('#name = :name');
    values[':name'] = name;
  }
  if ('prefs' in body) {
    sets.push('prefs = :prefs');
    values[':prefs'] = normalizePrefs(body['prefs']);
  }
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: profileKey(caller.id) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: { '#type': 'type', ...('name' in body ? { '#name': 'name' } : {}) },
      ExpressionAttributeValues: values,
    }),
  );
  return json(200, await profile(caller));
}

/** Stores a profile photo: a small JPEG the browser already cropped and resized. */
async function setAvatar(caller: Caller, body: Record<string, unknown>): Promise<Result> {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body['image'] ?? ''));
  const bytes = match ? Buffer.from(match[1], 'base64') : null;
  if (!bytes || bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return json(400, { message: 'Upload a JPEG image.' });
  }
  if (bytes.length > AVATAR_MAX_BYTES) return json(400, { message: 'That image is too large.' });

  const key = `avatars/${caller.id}/${newId()}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: AVATAR_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: 'image/jpeg',
      CacheControl: 'private, max-age=86400',
    }),
  );
  const { Attributes } = await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: profileKey(caller.id) },
      UpdateExpression: 'SET #type = :profile, avatarKey = :key',
      ExpressionAttributeNames: { '#type': 'type' },
      ExpressionAttributeValues: { ':profile': 'profile', ':key': key },
      ReturnValues: 'UPDATED_OLD',
    }),
  );
  await deleteAvatarObject(Attributes?.['avatarKey']);
  return json(200, await profile(caller));
}

async function removeAvatar(caller: Caller): Promise<Result> {
  const { Attributes } = await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: profileKey(caller.id) },
      UpdateExpression: 'REMOVE avatarKey',
      ReturnValues: 'UPDATED_OLD',
    }),
  );
  await deleteAvatarObject(Attributes?.['avatarKey']);
  return json(200, await profile(caller));
}

async function deleteAvatarObject(key: unknown): Promise<void> {
  if (typeof key !== 'string' || !key.startsWith('avatars/')) return;
  await s3.send(new DeleteObjectCommand({ Bucket: AVATAR_BUCKET, Key: key })).catch((error) => {
    console.warn('Could not delete old avatar', key, String(error));
  });
}

// ---------------------------------------------------------------------------
// Unsubscribe links
// ---------------------------------------------------------------------------

let unsubscribeSecret: Buffer | null = null;

/** A random key kept in the table (created on first use) for signing unsubscribe links. */
async function signingSecret(): Promise<Buffer> {
  if (unsubscribeSecret) return unsubscribeSecret;
  const pk = 'config#unsubscribe-secret';
  await db
    .send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk, type: 'config', secret: randomBytes(32).toString('base64') },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    )
    .catch((error) => {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
    });
  const { Item } = await db.send(
    new GetCommand({ TableName: TABLE, Key: { pk }, ConsistentRead: true }),
  );
  unsubscribeSecret = Buffer.from(String(Item!['secret']), 'base64');
  return unsubscribeSecret;
}

const unsubscribeToken = (memberId: string) => signedToken('unsubscribe', memberId);

/** An HMAC of purpose + member id: proves a link was made for that member. */
async function signedToken(purpose: string, memberId: string): Promise<string> {
  return createHmac('sha256', await signingSecret())
    .update(`${purpose}:${memberId}`)
    .digest('base64url');
}

async function validToken(purpose: string, memberId: string, token: string): Promise<boolean> {
  if (!memberId || !token) return false;
  const expected = await signedToken(purpose, memberId);
  return (
    token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}

/**
 * A member's private calendar subscription (Google/Apple Calendar poll it).
 * Signed per member, and only served while they're still in the group.
 */
async function calendarFeed(path: string): Promise<Result> {
  const match = /^\/calendar\/([^/]+)\/([^/.]+)\.ics$/.exec(path);
  const memberId = match ? decodeURIComponent(match[1]) : '';
  if (!match || !(await validToken('calendar', memberId, match[2]))) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
  }
  const [members, events] = await Promise.all([loadMembers(), loadEvents()]);
  if (!members.some((m) => m.id === memberId)) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
  }
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="neia-boiz.ics"',
      'Cache-Control': 'private, max-age=900',
    },
    body: calendarFeedIcs(
      events.filter((e) => isInvited(e, memberId)),
      env.SITE_URL,
    ),
  };
}

async function recipientLinks(memberId: string): Promise<RecipientLinks> {
  const token = await unsubscribeToken(memberId);
  return {
    preferences: `${env.SITE_URL}/profile`,
    unsubscribe: `${env.SITE_URL}/unsubscribe?m=${encodeURIComponent(memberId)}&t=${token}`,
  };
}

/** Turns off every event email for the member a signed link was made for. */
async function unsubscribe(body: Record<string, unknown>): Promise<Result> {
  const memberId = typeof body['m'] === 'string' ? body['m'] : '';
  const token = typeof body['t'] === 'string' ? body['t'] : '';
  if (!(await validToken('unsubscribe', memberId, token))) {
    return json(400, { message: 'This unsubscribe link is not valid.' });
  }
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: profileKey(memberId) },
      UpdateExpression: 'SET #type = :profile, prefs = :prefs',
      ExpressionAttributeNames: { '#type': 'type' },
      ExpressionAttributeValues: { ':profile': 'profile', ':prefs': NO_EMAILS },
    }),
  );
  return json(200, { unsubscribed: true });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

async function addComment(
  caller: Caller,
  eventId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const error = validateCommentInput(body);
  if (error) return json(400, { message: error });
  const input = body as unknown as CommentInput;
  const event = await loadVisibleEvent(caller, eventId);
  if (!event) return json(404, { message: 'Event not found' });

  let parent: StoredComment | null = null;
  if (input.parentId) {
    parent = await loadComment(input.parentId);
    if (!parent || parent.eventId !== eventId || parent.deleted) {
      return json(404, { message: "That comment isn't there anymore." });
    }
  }

  const comment: StoredComment = {
    id: newId(),
    eventId,
    parentId: input.parentId,
    authorId: caller.id,
    kind: input.kind,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
    deleted: false,
    status: input.kind === 'suggestion' ? 'open' : null,
  };
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: commentKey(comment.id), type: 'comment', ...comment },
    }),
  );

  // Top-level comments and suggestions go to the organizer; replies to the parent's author
  const recipientId = parent ? parent.authorId : event.createdBy;
  if (recipientId && recipientId !== caller.id) {
    const members = await loadMembers(true);
    const recipient = members.find((m) => m.id === recipientId);
    const kind: CommentEmailKind = parent ? 'reply' : input.kind;
    if (recipient && wantsEmail(recipient.prefs, kind)) {
      const author = members.find((m) => m.id === caller.id)?.name ?? 'Someone';
      const url = `${env.SITE_URL}/events/${eventId}#comment-${comment.id}`;
      const links = await recipientLinks(recipient.id);
      await sendEmail(
        recipient,
        commentEmail(kind, event, comment, author, url, links),
        `comment:${kind}`,
      );
    }
  }
  return json(201, toComment(comment));
}

/** Soft delete: the text goes, the comment stays as a placeholder for its replies. */
async function deleteComment(caller: Caller, eventId: string, commentId: string): Promise<Result> {
  const [event, comment] = await Promise.all([
    loadVisibleEvent(caller, eventId),
    loadComment(commentId),
  ]);
  if (!event || !comment || comment.eventId !== eventId)
    return json(404, { message: 'Comment not found' });
  if (comment.authorId !== caller.id && !canManage(event, caller.id, caller.isAdmin)) {
    return json(403, { message: 'You can only delete your own comments.' });
  }
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: commentKey(commentId) },
      UpdateExpression: `SET deleted = :true, body = :empty REMOVE authorId, ${REACTIONS.map((r) => reactionAttr(r.key)).join(', ')}`,
      ExpressionAttributeValues: { ':true': true, ':empty': '' },
    }),
  );
  return json(200, { id: commentId });
}

async function react(
  caller: Caller,
  eventId: string,
  commentId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const reaction = body['reaction'];
  if (!isReactionKey(reaction) || typeof body['on'] !== 'boolean') {
    return json(400, { message: 'Invalid reaction' });
  }
  if (!(await loadVisibleEvent(caller, eventId))) return json(404, { message: 'Event not found' });
  try {
    // A string set per reaction: ADD/DELETE are atomic, so simultaneous reactions don't clash
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: commentKey(commentId) },
        UpdateExpression: `${body['on'] ? 'ADD' : 'DELETE'} #reaction :me`,
        ConditionExpression: 'eventId = :event AND deleted = :false',
        ExpressionAttributeNames: { '#reaction': reactionAttr(reaction) },
        ExpressionAttributeValues: {
          ':me': new Set([caller.id]),
          ':event': eventId,
          ':false': false,
        },
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(404, { message: 'Comment not found' });
    }
    throw error;
  }
  return json(200, { reaction, on: body['on'] });
}

async function setStatus(
  caller: Caller,
  eventId: string,
  commentId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const status = body['status'];
  if (status !== 'open' && status !== 'accepted' && status !== 'declined') {
    return json(400, { message: 'Invalid status' });
  }
  const [event, comment] = await Promise.all([
    loadVisibleEvent(caller, eventId),
    loadComment(commentId),
  ]);
  if (!event || !comment || comment.eventId !== eventId || comment.kind !== 'suggestion') {
    return json(404, { message: 'Suggestion not found' });
  }
  if (!canManage(event, caller.id, caller.isAdmin)) return forbidden();
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: commentKey(commentId) },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status satisfies SuggestionStatus },
    }),
  );
  return json(200, { id: commentId, status });
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

    if (pollJustClosed(event, now)) {
      // Claim it first, so the organizer is told once even if runs overlap
      try {
        await db.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { pk: eventKey(event.id) },
            UpdateExpression: 'SET voteClosedNotified = :now',
            ConditionExpression:
              '(attribute_not_exists(voteClosedNotified) OR voteClosedNotified = :null) AND #status = :polling',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':now': now.toISOString(),
              ':null': null,
              ':polling': 'polling',
            },
          }),
        );
      } catch (error) {
        if ((error as { name?: string }).name === 'ConditionalCheckFailedException') continue;
        throw error;
      }
      await notifyPollClosed(event);
    }
  }
}

/** Emails the organizer the results once their poll's voting closes. */
async function notifyPollClosed(event: GroupEvent): Promise<void> {
  const members = await loadMembers(true);
  const organizer = members.find((m) => m.id === event.createdBy);
  if (!organizer || !wantsEmail(organizer.prefs, 'pollClosed')) return;

  const best = new Set(bestOptionIds(event));
  const results: PollResult[] = scoreOptions(event).map((score) => ({
    label: formatEventDate(event.options.find((o) => o.id === score.optionId)!),
    yes: score.yes,
    maybe: score.maybe,
    no: score.no,
    best: best.has(score.optionId),
  }));
  const invited = invitedMembers(event, members);
  const notVoted = invited.filter((m) => !event.votes[m.id]).map((m) => m.name);
  const email = pollClosedEmail(
    event,
    results,
    invited.length - notVoted.length,
    invited.length,
    notVoted,
    `${env.SITE_URL}/events/${event.id}`,
    await recipientLinks(organizer.id),
  );
  await sendEmail(organizer, email, 'pollClosed');
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
  /** Only these members (e.g. people just added to the invite list). */
  only?: Set<string>,
) {
  const members = await loadMembers(true);
  const by = actor ? members.find((m) => m.id === actor.id)?.name : undefined;
  const recipients = members.filter(
    (m) =>
      m.id !== actor?.id &&
      isInvited(event, m.id) &&
      (!only || only.has(m.id)) &&
      wantsEmail(m.prefs, kind) &&
      !(kind === 'reminder' && event.rsvps[m.id] === 'no'),
  );
  await Promise.all(
    recipients.map(async (member) => {
      const email = eventEmail(kind, event, `${env.SITE_URL}/events/${event.id}`, {
        by,
        reminderOffset,
        links: await recipientLinks(member.id),
      });
      await sendEmail(member, email, kind);
    }),
  );
}

/** Sends one email to one member. A failure is logged, not fatal. */
async function sendEmail(member: MemberRecord, email: Email, label: string): Promise<void> {
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.MAIL_FROM,
        Destination: { ToAddresses: [member.email] },
        Content: {
          Simple: {
            // Explicit UTF-8: dates use "–" and "·", which must not depend on a default
            Subject: { Data: email.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: email.text, Charset: 'UTF-8' },
              Html: { Data: email.html, Charset: 'UTF-8' },
            },
            // Lets mail apps show their own "Unsubscribe" button
            ...(email.unsubscribeUrl
              ? { Headers: [{ Name: 'List-Unsubscribe', Value: `<${email.unsubscribeUrl}>` }] }
              : {}),
          },
        },
      }),
    );
  } catch (error) {
    console.warn(`Could not email member ${member.id} (${label}):`, String(error));
  }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

const eventKey = (id: string) => `event#${id}`;
const commentKey = (id: string) => `comment#${id}`;
const reactionAttr = (key: ReactionKey) => `react_${key}`;

/** A comment as stored: reactions are separate string-set attributes. */
type StoredComment = Omit<EventComment, 'reactions'>;

async function loadComment(id: string): Promise<StoredComment | null> {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: commentKey(id) } }));
  return Item ? (toComment(Item) as StoredComment) : null;
}

/** An event's comments, oldest first. */
async function loadComments(eventId: string): Promise<EventComment[]> {
  const comments: EventComment[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: COMMENTS_INDEX,
        KeyConditionExpression: 'eventId = :event',
        ExpressionAttributeValues: { ':event': eventId },
        ExclusiveStartKey,
      }),
    );
    comments.push(...(page.Items ?? []).map(toComment));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return comments;
}

function toComment(item: Record<string, unknown>): EventComment {
  const reactions: EventComment['reactions'] = {};
  for (const { key } of REACTIONS) {
    const members = item[reactionAttr(key)];
    if (members instanceof Set && members.size) reactions[key] = [...members].map(String);
  }
  return {
    id: String(item['id']),
    eventId: String(item['eventId']),
    parentId: (item['parentId'] as string | null) ?? null,
    authorId: (item['authorId'] as string | undefined) ?? null,
    kind: item['kind'] === 'suggestion' ? 'suggestion' : 'comment',
    body: String(item['body'] ?? ''),
    createdAt: String(item['createdAt']),
    deleted: item['deleted'] === true,
    status: (item['status'] as SuggestionStatus | null) ?? null,
    reactions,
  };
}

/** The event if the caller may see it; a hidden event looks like a missing one. */
async function loadVisibleEvent(caller: Caller, id: string): Promise<GroupEvent | null> {
  const event = await loadEvent(id);
  return event && canSee(event, caller.id, caller.isAdmin) ? event : null;
}

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
const profileKey = (memberId: string) => `profile#${memberId}`;

/** Members of the member groups with their display names (cached briefly). */
async function loadMembers(fresh = false): Promise<MemberRecord[]> {
  // Brief cache for page loads; emails pass fresh = true so preferences are current
  if (!fresh && membersCache && Date.now() - membersCache.at < 60_000) return membersCache.members;

  const [users, items] = await Promise.all([
    Promise.all(MEMBER_GROUPS.map(listGroup)).then((lists) => lists.flat()),
    scanAll(),
  ]);
  const profiles = new Map(
    items
      .filter((item) => item['type'] === 'profile')
      .map((item) => [String(item['pk']).slice('profile#'.length), item]),
  );
  const byId = new Map<string, MemberRecord>();
  for (const user of users) {
    const attr = (name: string) => user.Attributes?.find((a) => a.Name === name)?.Value ?? '';
    const id = attr('sub');
    const email = attr('email');
    if (!id || !email || !user.Enabled || byId.has(id)) continue;
    const profile = profiles.get(id);
    const name = typeof profile?.['name'] === 'string' ? profile['name'] : null;
    byId.set(id, {
      id,
      email,
      name: name ?? email.split('@')[0],
      hasName: !!name,
      prefs: normalizePrefs(profile?.['prefs']),
      avatarKey: typeof profile?.['avatarKey'] === 'string' ? profile['avatarKey'] : null,
    });
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

/** Names and photos only: members never see each other's email addresses. */
const publicMembers = (members: MemberRecord[]): Promise<Member[]> =>
  Promise.all(
    members.map(async ({ id, name, avatarKey }) => ({
      id,
      name,
      avatarUrl: await avatarUrl(avatarKey),
    })),
  );

async function me(caller: Caller, members: MemberRecord[]) {
  const record = members.find((m) => m.id === caller.id);
  return {
    id: caller.id,
    name: record?.name ?? 'You',
    hasName: record?.hasName ?? false,
    isAdmin: caller.isAdmin,
    email: record?.email ?? '',
    prefs: record?.prefs ?? normalizePrefs(null),
    avatarUrl: await avatarUrl(record?.avatarKey ?? null),
  };
}

/**
 * A signed link to a private profile photo. Signed as of the start of the
 * current 6-hour window so the URL (and the browser's cached copy) stays the
 * same between page loads.
 */
async function avatarUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  const window = 6 * 60 * 60 * 1000;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: AVATAR_BUCKET, Key: key }), {
    expiresIn: 12 * 60 * 60,
    signingDate: new Date(Math.floor(Date.now() / window) * window),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newId = () => randomUUID().replace(/-/g, '').slice(0, 12);

function cleanDate(date: EventDate): EventDate {
  return {
    date: date.date,
    ...(date.endDate && date.endDate > date.date ? { endDate: date.endDate } : {}),
    ...(date.startTime ? { startTime: date.startTime } : {}),
    ...(date.startTime && date.endTime ? { endTime: date.endTime } : {}),
  };
}

const sameDate = (a: EventDate, b: EventDate) =>
  a.date === b.date &&
  (a.endDate ?? '') === (b.endDate ?? '') &&
  (a.startTime ?? '') === (b.startTime ?? '') &&
  (a.endTime ?? '') === (b.endTime ?? '');

/**
 * The invite list as stored: current members only, without duplicates or the
 * organizer (who's always invited). Null means everyone.
 */
async function cleanInvitees(
  invitees: string[] | null,
  organizer: string,
): Promise<string[] | null> {
  if (!invitees) return null;
  const members = new Set((await loadMembers()).map((m) => m.id));
  return [...new Set(invitees)].filter((id) => id !== organizer && members.has(id));
}

function cleanVoteBy(voteBy: EventInput['voteBy'] | undefined): VoteDeadline | null {
  if (!voteBy?.date) return null;
  return { date: voteBy.date, ...(voteBy.time ? { time: voteBy.time } : {}) };
}

const deadlinePassed = (voteBy: VoteDeadline, timeZone: string, now: Date) =>
  (voteDeadline({ voteBy, timeZone }) ?? now) <= now;

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
const notInvited = () => json(403, { message: "You're not invited to this one." });
