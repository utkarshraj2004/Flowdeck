import { describe, expect, it } from 'vitest';
import { matchesFilter, type Filter } from '../../web/src/board/Filter.js';
import { dueState } from '../../web/src/components/ui.js';

const card = (o: any = {}) => ({ id: '1', name: 'Write docs', labelIds: [], memberIds: [], dueAt: null, dueComplete: false, ...o }) as any;
const f = (o: Partial<Filter> = {}): Filter => ({ q: '', members: [], labels: [], due: '', status: '', mode: 'any', ...o });
const now = Date.parse('2026-06-01T12:00:00Z');

describe('board filter', () => {
  it('keyword, members (incl. none), labels, due and any/all', () => {
    expect(matchesFilter(card(), f({ q: 'docs' }), 'me')).toBe(true);
    expect(matchesFilter(card(), f({ q: 'tests' }), 'me')).toBe(false);
    expect(matchesFilter(card(), f({ members: ['none'] }), 'me')).toBe(true);
    expect(matchesFilter(card({ memberIds: ['u1'] }), f({ members: ['u1'] }), 'me')).toBe(true);
    const c = card({ labelIds: ['l1'], dueAt: '2026-05-30T00:00:00Z' });
    expect(matchesFilter(c, f({ labels: ['l1'], due: 'none' }), 'me', now)).toBe(true);
    expect(matchesFilter(c, f({ labels: ['l1'], due: 'none', mode: 'all' }), 'me', now)).toBe(false);
    expect(matchesFilter(c, f({ due: 'overdue' }), 'me', now)).toBe(true);
  });
});

describe('due badge state', () => {
  it.each([
    [null, false, 'none'],
    ['2026-06-03T12:00:00Z', false, 'later'],
    ['2026-06-01T20:00:00Z', false, 'soon'],
    ['2026-06-01T08:00:00Z', false, 'overdue'],
    ['2026-05-29T08:00:00Z', false, 'overdue-long'],
    ['2026-05-29T08:00:00Z', true, 'complete'],
  ])('%s complete=%s → %s', (due, complete, state) => {
    expect(dueState(due, complete, now)).toBe(state);
  });
});
