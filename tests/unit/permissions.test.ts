import { describe, expect, it } from 'vitest';
import { capabilities } from '../../server/src/lib/permissions.js';

const board = (prefs: Partial<{ comments: any; invitations: any; selfJoin: boolean }> = {}, closed = false) => ({
  prefs: { comments: 'members', invitations: 'members', selfJoin: true, cardCovers: true, ...prefs } as any,
  closed_at: closed ? '2026-01-01T00:00:00Z' : null,
});

describe('capability matrix (research 04, Flowdeck model)', () => {
  it.each([
    ['admin', { edit: true, admin: true, comment: true, invite: true }],
    ['member', { edit: true, admin: false, comment: true, invite: true }],
    ['observer', { edit: false, admin: false, comment: false, invite: false }],
    ['viewer', { edit: false, admin: false, comment: false, invite: false }],
  ] as const)('%s on an open board with default prefs', (role, expected) => {
    expect(capabilities(board(), role, role === 'viewer' ? null : role)).toMatchObject(expected);
  });

  it('comment preference widens or closes commenting', () => {
    expect(capabilities(board({ comments: 'observers' }), 'observer', 'observer').comment).toBe(true);
    expect(capabilities(board({ comments: 'workspace' }), 'viewer', null).comment).toBe(true);
    expect(capabilities(board({ comments: 'disabled' }), 'admin', 'admin').comment).toBe(false);
  });

  it('invitation preference restricts members', () => {
    expect(capabilities(board({ invitations: 'admins' }), 'member', 'member').invite).toBe(false);
  });

  it('closed boards are read-only for everyone, admins keep admin rights', () => {
    const c = capabilities(board({}, true), 'admin', 'admin');
    expect(c).toMatchObject({ edit: false, comment: false, admin: true, join: false });
  });

  it('self-join only for non-members when enabled', () => {
    expect(capabilities(board(), 'viewer', null).join).toBe(true);
    expect(capabilities(board({ selfJoin: false }), 'viewer', null).join).toBe(false);
    expect(capabilities(board(), 'member', 'member').join).toBe(false);
  });
});
