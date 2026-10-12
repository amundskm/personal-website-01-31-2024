/**
 * Event discussion: comments and suggestions with nested replies and emoji
 * reactions. Shared by the group-events Lambda and the event page.
 */

/** The fixed set of reactions; `key` is how each is stored. */
export const REACTIONS = [
  { key: 'thumbs', emoji: '👍', label: 'Thumbs up' },
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'party', emoji: '🎉', label: 'Celebrate' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'cheers', emoji: '🍻', label: 'Cheers' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];
export type CommentKind = 'comment' | 'suggestion';
export type SuggestionStatus = 'open' | 'accepted' | 'declined';

export const isReactionKey = (value: unknown): value is ReactionKey =>
  REACTIONS.some((r) => r.key === value);

export const COMMENT_MAX_LENGTH = 2000;

/** Replies indent up to this depth; deeper replies line up with it. */
export const MAX_INDENT = 4;

export interface EventComment {
  id: string;
  eventId: string;
  /** The comment this replies to; null for a top-level comment. */
  parentId: string | null;
  /** Null once deleted. */
  authorId: string | null;
  kind: CommentKind;
  /** Empty once deleted. */
  body: string;
  createdAt: string;
  deleted: boolean;
  /** Suggestions only: what the organizer decided. */
  status: SuggestionStatus | null;
  /** Member ids per reaction. */
  reactions: Partial<Record<ReactionKey, string[]>>;
}

export interface CommentNode extends EventComment {
  depth: number;
  children: CommentNode[];
}

/** Body of POST /events/{id}/comments. */
export interface CommentInput {
  body: string;
  kind: CommentKind;
  parentId: string | null;
}

/** Checks a new comment. Returns an error message, or null if valid. */
export function validateCommentInput(value: unknown): string | null {
  const input = value as Partial<CommentInput> | null;
  if (!input || typeof input !== 'object') return 'Missing comment';
  if (typeof input.body !== 'string' || !input.body.trim()) return 'Write something first.';
  if (input.body.length > COMMENT_MAX_LENGTH)
    return `Comments can be up to ${COMMENT_MAX_LENGTH.toLocaleString('en-US')} characters.`;
  if (input.kind !== 'comment' && input.kind !== 'suggestion') return 'Invalid comment type';
  if (input.parentId !== null && typeof input.parentId !== 'string') return 'Invalid reply';
  if (input.kind === 'suggestion' && input.parentId !== null)
    return 'Suggestions start a new thread; reply with a comment instead.';
  return null;
}

/**
 * Arranges comments into threads, oldest first at every level. Replies whose
 * parent is missing become top-level, and deleted comments with no remaining
 * replies are dropped.
 */
export function buildThreads(comments: EventComment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>(
    comments.map((c) => [c.id, { ...c, depth: 0, children: [] }]),
  );
  const roots: CommentNode[] = [];
  for (const node of [...nodes.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const prune = (list: CommentNode[], depth: number): CommentNode[] =>
    list.flatMap((node) => {
      node.depth = depth;
      node.children = prune(node.children, depth + 1);
      return node.deleted && !node.children.length ? [] : [node];
    });
  return prune(roots, 0);
}

/** How many comments a thread list shows (deleted placeholders don't count). */
export function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.deleted ? 0 : 1) + countComments(n.children), 0);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(new Date(iso).getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
