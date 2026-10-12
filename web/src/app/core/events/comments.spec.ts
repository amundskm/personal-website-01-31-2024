import {
  buildThreads,
  countComments,
  type EventComment,
  timeAgo,
  validateCommentInput,
} from './comments';

// Made-up comments only: the repository is public.
const comment = (
  id: string,
  parentId: string | null,
  createdAt: string,
  extra: Partial<EventComment> = {},
): EventComment => ({
  id,
  eventId: 'evt1',
  parentId,
  authorId: 'alice',
  kind: 'comment',
  body: id,
  createdAt,
  deleted: false,
  status: null,
  reactions: {},
  ...extra,
});

describe('buildThreads', () => {
  it('nests replies under their parents, oldest first, with depths', () => {
    const threads = buildThreads([
      comment('b', null, '2030-01-02'),
      comment('a', null, '2030-01-01'),
      comment('a2', 'a', '2030-01-04'),
      comment('a1', 'a', '2030-01-03'),
      comment('a1x', 'a1', '2030-01-05'),
    ]);
    expect(threads.map((t) => t.id)).toEqual(['a', 'b']);
    expect(threads[0].children.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(threads[0].children[0].children[0]).toMatchObject({ id: 'a1x', depth: 2 });
  });

  it('keeps deleted comments that have replies, drops the rest, and promotes orphans', () => {
    const threads = buildThreads([
      comment('gone', null, '2030-01-01', { deleted: true }),
      comment('kept', null, '2030-01-02', { deleted: true }),
      comment('reply', 'kept', '2030-01-03'),
      comment('orphan', 'missing', '2030-01-04'),
    ]);
    expect(threads.map((t) => t.id)).toEqual(['kept', 'orphan']);
    expect(countComments(threads)).toBe(2); // the deleted placeholder doesn't count
  });
});

describe('validateCommentInput', () => {
  it('accepts comments, suggestions and replies', () => {
    expect(validateCommentInput({ body: 'Hi', kind: 'comment', parentId: null })).toBeNull();
    expect(
      validateCommentInput({ body: 'Start at 7', kind: 'suggestion', parentId: null }),
    ).toBeNull();
    expect(validateCommentInput({ body: 'Agreed', kind: 'comment', parentId: 'c1' })).toBeNull();
  });

  it('rejects empty, overlong and nested suggestions', () => {
    expect(validateCommentInput({ body: '  ', kind: 'comment', parentId: null })).toMatch(/Write/);
    expect(
      validateCommentInput({ body: 'x'.repeat(2001), kind: 'comment', parentId: null }),
    ).toMatch(/2,000/);
    expect(validateCommentInput({ body: 'x', kind: 'suggestion', parentId: 'c1' })).toMatch(
      /new thread/,
    );
    expect(validateCommentInput({ body: 'x', kind: 'shout', parentId: null })).toMatch(/type/);
  });
});

describe('timeAgo', () => {
  const now = new Date('2030-06-10T12:00:00Z');
  it('describes recent times relatively, older ones by date', () => {
    expect(timeAgo('2030-06-10T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2030-06-10T11:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2030-06-10T07:00:00Z', now)).toBe('5 h ago');
    expect(timeAgo('2030-06-09T11:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2030-05-01T12:00:00Z', now)).toBe('May 1');
    expect(timeAgo('2029-05-01T12:00:00Z', now)).toBe('May 1, 2029');
  });
});
