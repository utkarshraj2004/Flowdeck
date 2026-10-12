export const BACKGROUNDS = ['ocean', 'forest', 'sunset', 'berry', 'slate', 'sand', 'teal', 'plum'] as const;
export const LABEL_HUES = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'] as const;
/** 30 colours: a subtle, a normal and a bold shade of each hue. The plain hue names are the original 10 colours. */
export const LABEL_COLORS = LABEL_HUES.flatMap((h) => [`${h}_subtle`, h, `${h}_bold`] as const);
/** Notification kinds a user may turn off. Access changes (removed, role changed) are always delivered. */
export const MUTABLE_NOTIFICATIONS = [
  'mentioned', 'added_to_card', 'removed_from_card', 'commented', 'due_changed', 'completed', 'attachment_added',
  'card_archived', 'card_moved', 'card_created', 'added_to_board', 'invite_accepted',
] as const;
export const DEFAULT_LABELS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue'] as const;
export const REPLAY_LIMIT = 1000;
export const LIMITS = { openCardsPerBoard: 5000, openListsPerBoard: 475, labelsPerBoard: 950, checklistsPerCard: 50, itemsPerChecklist: 200, attachmentsPerCard: 100 };
