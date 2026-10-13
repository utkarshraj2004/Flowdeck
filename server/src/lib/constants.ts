export const BACKGROUNDS = ['ocean', 'forest', 'sunset', 'berry', 'slate', 'sand', 'teal', 'plum'] as const;
export const LABEL_HUES = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'] as const;
/** 30 colours: a subtle, a normal and a bold shade of each hue. The plain hue names are the original 10 colours. */
export const LABEL_COLORS = LABEL_HUES.flatMap((h) => [`${h}_subtle`, h, `${h}_bold`] as const);
/** Notification kinds a user may turn off. Access changes (added, removed, role changed) are always delivered. */
export const MUTABLE_NOTIFICATIONS = [
  'mentioned', 'added_to_card', 'removed_from_card', 'commented', 'due_changed', 'completed', 'attachment_added',
  'card_archived', 'card_moved', 'card_created', 'invite_accepted',
] as const;
export const DEFAULT_LABELS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue'] as const;
export const REPLAY_LIMIT = 1000;
export const DEFAULT_LIMITS = { openCardsPerBoard: 5000, openListsPerBoard: 475, labelsPerBoard: 950, checklistsPerCard: 50, itemsPerChecklist: 200, attachmentsPerCard: 100 };
export type Limits = typeof DEFAULT_LIMITS;

/** Operators can change each limit with FLOWDECK_LIMIT_<NAME> (for example FLOWDECK_LIMIT_OPEN_CARDS_PER_BOARD=10000). */
export function limitsFromEnv(env: Record<string, string | undefined>): Limits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(out) as (keyof Limits)[]) {
    const name = `FLOWDECK_LIMIT_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new Error(`${name} must be a whole number between 1 and 1000000`);
    out[key] = n;
  }
  return out;
}
export const LIMITS: Limits = limitsFromEnv(process.env);
