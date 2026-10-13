export interface Member {
  id: string;
  username: string;
  fullName: string;
  initials: string;
  role: 'admin' | 'member' | 'observer';
  isGuest: boolean;
}
export interface Label {
  id: string;
  name: string;
  color: string | null;
}
export interface List {
  id: string;
  boardId: string;
  name: string;
  position: string;
  archivedAt: string | null;
}
export interface Card {
  id: string;
  boardId: string;
  listId: string;
  number: number;
  name: string;
  position: string;
  startAt: string | null;
  dueAt: string | null;
  dueComplete: boolean;
  cover: { color?: string; attachmentId?: string } | null;
  archivedAt: string | null;
  isTemplate?: boolean;
  labelIds: string[];
  memberIds: string[];
  badges: { description: boolean; comments: number; attachments: number; checkItems: number; checkItemsChecked: number };
}
export interface Access {
  role: 'admin' | 'member' | 'observer' | 'viewer';
  boardRole: string | null;
  workspaceRole: string | null;
  can: { view: boolean; edit: boolean; admin: boolean; comment: boolean; invite: boolean; join: boolean };
}
export interface Board {
  id: string;
  shortId: string;
  workspaceId: string;
  name: string;
  description: string;
  visibility: 'private' | 'workspace';
  background: string;
  prefs: { comments: string; invitations: string; selfJoin: boolean; cardCovers: boolean };
  closedAt: string | null;
  starred?: boolean;
  watching?: boolean;
  isTemplate?: boolean;
}
export interface BoardState {
  board: Board;
  workspace: { id: string; name: string };
  access: Access;
  members: Member[];
  labels: Label[];
  lists: Record<string, List>;
  cards: Record<string, Card>;
  watchedListIds: string[];
  watchedCardIds: string[];
  /** Cards with notifications the current user has not read (unread markers). */
  unreadCardIds: string[];
}
export interface BoardEvent {
  type: 'event';
  board: string;
  seq: number;
  event: string;
  actor: string | null;
  at: string;
  data: any;
}

export function fromSnapshot(s: any): BoardState {
  return {
    board: s.board,
    workspace: s.workspace,
    access: s.access,
    members: s.members,
    labels: s.labels,
    lists: Object.fromEntries(s.lists.map((l: List) => [l.id, l])),
    cards: Object.fromEntries(s.cards.map((c: Card) => [c.id, c])),
    watchedListIds: s.watchedListIds ?? [],
    watchedCardIds: s.watchedCardIds ?? [],
    unreadCardIds: s.unreadCardIds ?? [],
  };
}

export const byPos = (a: { position: string; id: string }, b: { position: string; id: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1;

export function sortedLists(s: BoardState) {
  return Object.values(s.lists)
    .filter((l) => !l.archivedAt)
    .sort(byPos);
}

export function cardsInList(s: BoardState, listId: string) {
  return Object.values(s.cards)
    .filter((c) => c.listId === listId && !c.archivedAt)
    .sort(byPos);
}

function upsertCards(cards: Record<string, Card>, list: Card[] | undefined) {
  if (!list?.length) return cards;
  const next = { ...cards };
  for (const c of list) if (c) next[c.id] = c;
  return next;
}

function applyRebalance<T extends { position: string }>(map: Record<string, T>, rebalanced: { id: string; position: string }[] | undefined) {
  if (!rebalanced?.length) return map;
  const next = { ...map };
  for (const r of rebalanced) if (next[r.id]) next[r.id] = { ...next[r.id], position: r.position };
  return next;
}

/** Apply one server event. Events carry the changed entity, so this is an upsert/remove, never a merge of guesses. */
export function reduceEvent(s: BoardState, e: BoardEvent): BoardState {
  const d = e.data ?? {};
  const [kind] = e.event.split('.');
  let next: BoardState = s;
  if (d.board) next = { ...next, board: { ...next.board, ...d.board, starred: next.board.starred, watching: next.board.watching } };
  if (d.members) next = { ...next, members: d.members };
  if (d.labels?.length) {
    const labels = [...next.labels];
    for (const l of d.labels) if (!labels.some((x) => x.id === l.id)) labels.push(l);
    next = { ...next, labels };
  }
  if (d.label) {
    const others = next.labels.filter((l) => l.id !== d.label.id);
    const idx = next.labels.findIndex((l) => l.id === d.label.id);
    next = { ...next, labels: idx === -1 ? [...others, d.label] : next.labels.map((l) => (l.id === d.label.id ? d.label : l)) };
  }
  if (e.event === 'label.deleted') {
    const cards = { ...next.cards };
    for (const c of Object.values(cards)) if (c.labelIds.includes(d.labelId)) cards[c.id] = { ...c, labelIds: c.labelIds.filter((x) => x !== d.labelId) };
    next = { ...next, labels: next.labels.filter((l) => l.id !== d.labelId), cards };
  }
  if (e.event === 'board.member_removed' && d.cardIds?.length) {
    const cards = { ...next.cards };
    for (const id of d.cardIds) if (cards[id]) cards[id] = { ...cards[id], memberIds: cards[id].memberIds.filter((x) => x !== d.userId) };
    next = { ...next, cards };
  }
  if (d.list) next = { ...next, lists: { ...next.lists, [d.list.id]: d.list } };
  if (kind === 'list' && d.rebalanced) next = { ...next, lists: applyRebalance(next.lists, d.rebalanced) };
  if (kind !== 'list' && d.rebalanced) next = { ...next, cards: applyRebalance(next.cards, d.rebalanced) };
  if (d.cards) next = { ...next, cards: upsertCards(next.cards, d.cards) };
  if (d.card) next = { ...next, cards: { ...next.cards, [d.card.id]: d.card } };
  if (e.event === 'list.deleted' || e.event === 'list.moved_out') {
    const lists = { ...next.lists };
    delete lists[d.listId];
    const cards = Object.fromEntries(Object.entries(next.cards).filter(([, c]) => c.listId !== d.listId));
    next = { ...next, lists, cards };
  }
  if (e.event === 'list.cards_archived') {
    const cards = { ...next.cards };
    for (const id of d.cardIds ?? []) if (cards[id]) cards[id] = { ...cards[id], archivedAt: e.at };
    next = { ...next, cards };
  }
  if (e.event === 'card.deleted' || e.event === 'card.moved_out') {
    const cards = { ...next.cards };
    delete cards[d.cardId];
    next = { ...next, cards };
  }
  return next;
}

export function describeActivity(item: { type: string; summary: any }, opts: { onCard?: boolean } = {}): string {
  const text = describeBase(item, opts);
  // Changes made by an automation rule name the rule, so people can tell them from manual edits.
  return item.summary?.automation ? `${text} (rule “${item.summary.automation}”)` : text;
}

function describeBase(item: { type: string; summary: any }, opts: { onCard?: boolean }): string {
  const s = item.summary ?? {};
  const card = opts.onCard ? 'this card' : `“${s.cardName ?? 'a card'}”`;
  switch (item.type) {
    case 'board.created':
      return s.copiedFrom ? 'created this board as a copy' : 'created this board';
    case 'board.updated':
      if (s.changed?.includes('name')) return `renamed this board to “${s.name}” (was “${s.from}”)`;
      if (s.changed?.includes('visibility')) return `made this board ${s.visibility === 'private' ? 'private' : 'visible to the workspace'}`;
      return 'changed board settings';
    case 'board.closed':
      return 'closed this board';
    case 'board.reopened':
      return 'reopened this board';
    case 'board.member_added':
      return s.joined ? 'joined this board' : `added ${s.userName ?? 'someone'} to this board as ${s.role}`;
    case 'board.member_removed':
      return s.self ? 'left this board' : 'removed a member from this board';
    case 'board.member_role_changed':
      return `changed a member’s role to ${s.role}`;
    case 'list.created':
      return s.copiedFrom ? `copied list “${s.copiedFrom}” as “${s.name}”` : `added list “${s.name}”`;
    case 'list.updated':
      return `renamed list “${s.from}” to “${s.name}”`;
    case 'list.archived':
      return `archived list “${s.name}”`;
    case 'list.restored':
      return `restored list “${s.name}”`;
    case 'list.deleted':
      return `deleted list “${s.name}” and its ${s.cards} card(s)`;
    case 'list.moved_out':
      return `moved list “${s.name}” to board “${s.toBoard}”`;
    case 'list.moved_in':
      return `moved list “${s.name}” here from board “${s.fromBoard}”`;
    case 'list.cards_archived':
      return `archived all ${s.count} card(s) in “${s.name}”`;
    case 'list.cards_sorted':
      return `sorted the cards in “${s.name}” by ${({ name: 'name', due: 'due date', newest: 'newest first', oldest: 'oldest first' } as Record<string, string>)[s.by] ?? s.by}`;
    case 'check_item.converted':
      return `turned the checklist item “${s.itemName}” into card #${s.newCardNumber}`;
    case 'list.cards_moved':
      return `moved ${s.count} card(s) from “${s.from}” to “${s.to}”`;
    case 'card.created':
      return s.copiedFrom ? `copied ${card} from “${s.copiedFrom}”` : `added ${card} to ${s.listName}`;
    case 'card.updated': {
      const c: string[] = s.changed ?? [];
      if (c.includes('name')) return `renamed ${opts.onCard ? 'this card' : `“${s.from}”`} to “${s.to}”`;
      if (c.includes('description')) return `updated the description of ${card}`;
      if (c.includes('dueComplete')) return s.dueComplete ? `marked ${card} complete` : `marked ${card} incomplete`;
      if (c.includes('dueAt')) return s.dueAt ? `set the due date of ${card} to ${new Date(s.dueAt).toLocaleString()}` : `removed the due date of ${card}`;
      if (c.includes('startAt')) return `changed the start date of ${card}`;
      return `updated ${card}`;
    }
    case 'card.moved':
      return `moved ${card} from ${s.fromList} to ${s.toList}`;
    case 'card.moved_in':
      return `moved ${card} here from board “${s.fromBoard}”${s.droppedMembers?.length ? ` (${s.droppedMembers.length} member(s) not on this board were removed)` : ''}`;
    case 'card.moved_out':
      return `moved ${card} to board “${s.toBoard}”`;
    case 'card.archived':
      return `archived ${card}`;
    case 'card.restored':
      return `restored ${card}`;
    case 'card.deleted':
      return `deleted card #${s.cardNumber} “${s.cardName}”`;
    case 'card.label_added':
      return `added label “${s.labelName || s.labelColor}” to ${card}`;
    case 'card.label_removed':
      return `removed label “${s.labelName || s.labelColor}” from ${card}`;
    case 'card.member_added':
      return `added ${s.userName ?? 'someone'} to ${card}`;
    case 'card.member_removed':
      return `removed ${s.userName ?? 'someone'} from ${card}`;
    case 'checklist.added':
      return `added checklist “${s.checklistName}” to ${card}`;
    case 'checklist.removed':
      return `removed checklist “${s.checklistName}” from ${card}`;
    case 'checklist.renamed':
      return `renamed checklist “${s.from}” to “${s.checklistName}”`;
    case 'check_item.checked':
      return `completed “${s.itemName}” on ${card}`;
    case 'check_item.unchecked':
      return `marked “${s.itemName}” incomplete on ${card}`;
    case 'comment.added':
      return `commented on ${card}`;
    case 'comment.deleted':
      return `deleted a comment on ${card}`;
    case 'attachment.added':
      return `attached ${s.attachmentName} to ${card}`;
    case 'attachment.removed':
      return `removed attachment ${s.attachmentName} from ${card}`;
    case 'label.deleted':
      return `deleted label “${s.name || s.color}”`;
    case 'automation.failed':
      return `triggered rule “${s.ruleName}” on ${card}, but it could not run: ${s.error}. The change itself was saved.`;
    default:
      return item.type;
  }
}
