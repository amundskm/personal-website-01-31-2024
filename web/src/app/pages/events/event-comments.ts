import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import {
  buildThreads,
  COMMENT_MAX_LENGTH,
  type CommentInput,
  type CommentKind,
  type CommentNode,
  countComments,
  MAX_INDENT,
  REACTIONS,
  type ReactionKey,
  type SuggestionStatus,
  timeAgo,
} from '../../core/events/comments';
import { canManage, type EventDetail } from '../../core/events/events';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  declined: 'Declined',
};

/**
 * An event's discussion: comments and suggestions, nested replies and
 * reactions. Emits `changed` after any write so the page reloads.
 */
@Component({
  selector: 'app-event-comments',
  imports: [NgTemplateOutlet, MemberAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ev-card ev-discussion">
      <h2>
        Discussion <span class="ev-count">{{ total() }}</span>
      </h2>

      <form class="ev-composer" (submit)="post($event, null)">
        <div class="ev-kind" role="radiogroup" aria-label="Post as">
          <label>
            <input
              type="radio"
              name="kind"
              value="comment"
              [checked]="kind() === 'comment'"
              (change)="kind.set('comment')"
            />
            Comment
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="suggestion"
              [checked]="kind() === 'suggestion'"
              (change)="kind.set('suggestion')"
            />
            Suggest a change
          </label>
        </div>
        <label class="visually-hidden" for="new-comment">Your {{ kind() }}</label>
        <textarea
          id="new-comment"
          name="body"
          rows="3"
          required
          [attr.maxlength]="maxLength"
          [placeholder]="
            kind() === 'suggestion'
              ? 'What should change? e.g. start an hour later'
              : 'Say something…'
          "
        ></textarea>
        <div class="button-row">
          <button type="submit" class="btn btn--primary" [disabled]="busy()">
            {{ kind() === 'suggestion' ? 'Post suggestion' : 'Post comment' }}
          </button>
        </div>
        <p class="ev-meta">
          {{
            kind() === 'suggestion'
              ? 'The organizer gets an email and can accept or decline it.'
              : 'The organizer gets an email.'
          }}
        </p>
      </form>

      <p class="visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>
      @if (message(); as m) {
        <p class="ev-status" [class.ev-error]="m.error" [attr.role]="m.error ? 'alert' : 'status'">
          {{ m.text }}
        </p>
      }

      @if (threads().length) {
        <ol class="ev-thread">
          <ng-container *ngTemplateOutlet="list; context: { $implicit: threads() }" />
        </ol>
      } @else {
        <p class="empty">No comments yet. Start the conversation.</p>
      }
    </article>

    <ng-template #list let-nodes>
      @for (node of nodes; track node.id) {
        <li
          class="ev-comment"
          [id]="'comment-' + node.id"
          [class.is-new]="fresh().has(node.id)"
          [class.is-suggestion]="node.kind === 'suggestion'"
          [class.is-deleted]="node.deleted"
          [class.is-highlighted]="highlighted() === node.id"
        >
          @if (node.deleted) {
            <p class="ev-meta">Comment deleted</p>
          } @else {
            <header class="ev-comment__head">
              <app-member-avatar
                [name]="nameOf(node.authorId)"
                [url]="avatarOf(node.authorId)"
                [size]="28"
              />
              <strong>{{ nameOf(node.authorId) }}</strong>
              @if (node.kind === 'suggestion') {
                <span class="ev-tag" [class]="'ev-tag ev-tag--' + node.status">
                  Suggestion · {{ statusLabel(node.status) }}
                </span>
              }
              <span class="ev-meta" [title]="node.createdAt">{{ ago(node.createdAt) }}</span>
            </header>
            <p class="ev-comment__body">{{ node.body }}</p>

            <div class="ev-comment__actions">
              @for (r of reactionsOn(node); track r.key) {
                <button
                  type="button"
                  class="ev-reaction"
                  [class.is-mine]="r.mine"
                  [attr.aria-pressed]="r.mine"
                  [title]="r.names"
                  [attr.aria-label]="r.label + ': ' + r.names"
                  [disabled]="busy()"
                  (click)="toggleReaction(node, r.key, !r.mine)"
                >
                  {{ r.emoji }} <span>{{ r.count }}</span>
                </button>
              }
              <button
                type="button"
                class="ev-link"
                [attr.aria-expanded]="picker() === node.id"
                (click)="picker.set(picker() === node.id ? null : node.id)"
              >
                <span aria-hidden="true">☺+</span
                ><span class="visually-hidden">Add a reaction</span>
              </button>
              <button type="button" class="ev-link" (click)="startReply(node.id)">Reply</button>
              @if (canDelete(node)) {
                <button type="button" class="ev-link" [disabled]="busy()" (click)="remove(node)">
                  Delete
                </button>
              }
              @if (node.kind === 'suggestion' && manager()) {
                @for (s of statusChoices(node); track s) {
                  <button
                    type="button"
                    class="ev-link"
                    [disabled]="busy()"
                    (click)="setStatus(node, s)"
                  >
                    {{
                      s === 'open' ? 'Reopen' : statusLabel(s) === 'Accepted' ? 'Accept' : 'Decline'
                    }}
                  </button>
                }
              }
            </div>

            @if (picker() === node.id) {
              <div class="ev-picker" role="group" aria-label="Reactions">
                @for (r of reactions; track r.key) {
                  <button
                    type="button"
                    [title]="r.label"
                    [attr.aria-label]="r.label"
                    [disabled]="busy()"
                    (click)="toggleReaction(node, r.key, !hasMine(node, r.key)); picker.set(null)"
                  >
                    {{ r.emoji }}
                  </button>
                }
              </div>
            }

            @if (replyingTo() === node.id) {
              <form class="ev-composer ev-composer--reply" (submit)="post($event, node.id)">
                <label class="visually-hidden" [for]="'reply-' + node.id"
                  >Reply to {{ nameOf(node.authorId) }}</label
                >
                <textarea
                  [id]="'reply-' + node.id"
                  name="body"
                  rows="2"
                  required
                  [attr.maxlength]="maxLength"
                  [placeholder]="'Reply to ' + nameOf(node.authorId) + '…'"
                ></textarea>
                <div class="button-row">
                  <button type="submit" class="btn btn--primary" [disabled]="busy()">Reply</button>
                  <button type="button" class="btn btn--text" (click)="replyingTo.set(null)">
                    Cancel
                  </button>
                </div>
              </form>
            }
          }

          @if (node.children.length) {
            <ol class="ev-thread" [class.ev-thread--flat]="node.depth >= maxIndent">
              <ng-container *ngTemplateOutlet="list; context: { $implicit: node.children }" />
            </ol>
          }
        </li>
      }
    </ng-template>
  `,
  styleUrl: './event-comments.scss',
})
export class EventComments {
  private readonly auth = inject(AuthService);

  readonly detail = input.required<EventDetail>();
  readonly changed = output<void>();

  protected readonly reactions = REACTIONS;
  protected readonly maxLength = COMMENT_MAX_LENGTH;
  protected readonly maxIndent = MAX_INDENT;

  protected readonly kind = signal<CommentKind>('comment');
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly picker = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  /** The comment a link (e.g. from an email) points at. */
  protected readonly highlighted = signal<string | null>(null);

  /** Other people's comments that arrived while the page was open, briefly highlighted. */
  protected readonly fresh = signal<Set<string>>(new Set());
  protected readonly announcement = signal('');
  private known: Set<string> | null = null;

  protected readonly threads = computed(() => buildThreads(this.detail().comments ?? []));
  protected readonly total = computed(() => countComments(this.threads()));
  protected readonly manager = computed(() => {
    const d = this.detail();
    return canManage(d.event, d.me.id, d.me.isAdmin);
  });

  private readonly names = computed(
    () => new Map(this.detail().members.map((m) => [m.id, m.name])),
  );
  private readonly avatars = computed(
    () => new Map(this.detail().members.map((m) => [m.id, m.avatarUrl ?? null])),
  );

  protected avatarOf(id: string | null): string | null {
    return id ? (this.avatars().get(id) ?? null) : null;
  }

  constructor() {
    // Spot comments that weren't there before (from the page's background refresh)
    effect(() => {
      const { comments, me } = this.detail();
      const ids = (comments ?? []).map((c) => c.id);
      if (!this.known) {
        this.known = new Set(ids);
        return;
      }
      const added = (comments ?? []).filter(
        (c) => !this.known!.has(c.id) && c.authorId !== me.id && !c.deleted,
      );
      ids.forEach((id) => this.known!.add(id));
      if (!added.length) return;
      const addedIds = added.map((c) => c.id);
      this.fresh.update((set) => new Set([...set, ...addedIds]));
      this.announcement.set(added.length === 1 ? '1 new comment' : `${added.length} new comments`);
      setTimeout(() => {
        this.fresh.update((set) => new Set([...set].filter((id) => !addedIds.includes(id))));
      }, 8000);
    });

    // Scroll to #comment-<id> once the comments have rendered
    let scrolled = false;
    afterRenderEffect(() => {
      if (scrolled || !this.threads().length) return;
      const id = location.hash.match(/^#comment-(.+)$/)?.[1];
      scrolled = true;
      if (!id) return;
      document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'center' });
      this.highlighted.set(id);
    });
  }

  protected readonly ago = (iso: string) => timeAgo(iso);
  protected readonly statusLabel = (status: SuggestionStatus | null) =>
    STATUS_LABELS[status ?? 'open'];
  protected readonly statusChoices = (node: CommentNode): SuggestionStatus[] =>
    node.status === 'open' || !node.status ? ['accepted', 'declined'] : ['open'];

  protected nameOf(id: string | null): string {
    if (!id) return 'Someone';
    if (id === this.detail().me.id) return 'You';
    return this.names().get(id) ?? 'A former member';
  }

  protected canDelete(node: CommentNode): boolean {
    return node.authorId === this.detail().me.id || this.manager();
  }

  protected hasMine(node: CommentNode, key: ReactionKey): boolean {
    return node.reactions[key]?.includes(this.detail().me.id) ?? false;
  }

  /** Reactions with at least one person, in the fixed order. */
  protected reactionsOn(node: CommentNode) {
    return REACTIONS.flatMap((r) => {
      const ids = node.reactions[r.key] ?? [];
      if (!ids.length) return [];
      return [
        {
          ...r,
          count: ids.length,
          mine: ids.includes(this.detail().me.id),
          names: ids.map((id) => this.nameOf(id)).join(', '),
        },
      ];
    });
  }

  protected startReply(id: string): void {
    this.replyingTo.set(id);
    this.message.set(null);
    setTimeout(() => document.getElementById(`reply-${id}`)?.focus());
  }

  protected post(event: SubmitEvent, parentId: string | null): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    const input: CommentInput = { body, kind: parentId ? 'comment' : this.kind(), parentId };
    void this.run(`/events/${this.detail().event.id}/comments`, 'POST', input, () => {
      form.reset();
      this.replyingTo.set(null);
      this.kind.set('comment');
      return parentId
        ? 'Reply posted.'
        : input.kind === 'suggestion'
          ? 'Suggestion posted.'
          : 'Comment posted.';
    });
  }

  protected toggleReaction(node: CommentNode, reaction: ReactionKey, on: boolean): void {
    void this.run(this.commentPath(node, 'reactions'), 'PUT', { reaction, on }, () => null);
  }

  protected remove(node: CommentNode): void {
    if (!confirm('Delete this comment?')) return;
    void this.run(this.commentPath(node), 'DELETE', undefined, () => 'Comment deleted.');
  }

  protected setStatus(node: CommentNode, status: SuggestionStatus): void {
    void this.run(this.commentPath(node, 'status'), 'PUT', { status }, () =>
      status === 'open'
        ? 'Suggestion reopened.'
        : `Suggestion ${STATUS_LABELS[status].toLowerCase()}.`,
    );
  }

  private commentPath(node: CommentNode, action?: string): string {
    return `/events/${this.detail().event.id}/comments/${node.id}${action ? `/${action}` : ''}`;
  }

  private async run(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    done: () => string | null,
  ): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.auth.fetchMembersApi(path, { method, body });
      const text = done();
      if (text) this.message.set({ text, error: false });
      this.changed.emit();
    } catch (error) {
      this.message.set({
        text: error instanceof Error ? error.message : 'Something went wrong.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
