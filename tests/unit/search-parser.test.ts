import { describe, expect, it } from 'vitest';
import { parseQuery } from '../../server/src/lib/search.js';

describe('search query parser', () => {
  it('parses text, phrases, operators and negation', () => {
    expect(parseQuery('invoice "due soon" -draft @me #urgent board:Ops due:week has:attachments is:archived')).toEqual([
      { kind: 'text', value: 'invoice', negate: false },
      { kind: 'text', value: 'due soon', negate: false },
      { kind: 'text', value: 'draft', negate: true },
      { kind: 'member', value: 'me', negate: false },
      { kind: 'label', value: 'urgent', negate: false },
      { kind: 'board', value: 'ops', negate: false },
      { kind: 'due', value: 'week', negate: false },
      { kind: 'has', value: 'attachments', negate: false },
      { kind: 'is', value: 'archived', negate: false },
    ]);
  });
  it('treats unknown operators as text', () => {
    expect(parseQuery('foo:bar')).toEqual([{ kind: 'text', value: 'foo:bar', negate: false }]);
  });
});
