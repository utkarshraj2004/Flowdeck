/**
 * Search query parser (research 06): free text, "phrases", -negation and the
 * operators @user, @me, #label, label:, board:, list:, due:, has:, is:.
 * Unknown operators are treated as text.
 */
export interface Term {
  kind: 'text' | 'member' | 'label' | 'board' | 'list' | 'due' | 'has' | 'is';
  value: string;
  negate: boolean;
}

export function parseQuery(q: string): Term[] {
  const terms: Term[] = [];
  const re = /(-?)(?:([a-z]+):)?(?:"([^"]*)"|(\S+))/gi;
  for (const m of q.matchAll(re)) {
    const negate = m[1] === '-';
    const op = m[2]?.toLowerCase();
    const raw = (m[3] ?? m[4] ?? '').trim();
    if (!raw && !op) continue;
    if (op && ['label', 'board', 'list', 'due', 'has', 'is', 'member'].includes(op)) {
      terms.push({ kind: op as Term['kind'], value: raw.toLowerCase(), negate });
    } else if (op) {
      terms.push({ kind: 'text', value: `${op}:${raw}`, negate });
    } else if (raw.startsWith('@') && raw.length > 1) {
      terms.push({ kind: 'member', value: raw.slice(1).toLowerCase(), negate });
    } else if (raw.startsWith('#') && raw.length > 1) {
      terms.push({ kind: 'label', value: raw.slice(1).toLowerCase(), negate });
    } else if (raw) {
      terms.push({ kind: 'text', value: raw, negate });
    }
  }
  return terms;
}

/** Build a SQL condition list for the terms. Parameters are appended to `params`. */
export function termsToSql(terms: Term[], params: unknown[], userId: string): { where: string[]; includeArchived: boolean } {
  const where: string[] = [];
  let includeArchived = false;
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  for (const t of terms) {
    let cond: string | null = null;
    switch (t.kind) {
      case 'text': {
        const like = p(`%${t.value.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
        cond = `(c.name ILIKE ${like} OR c.description ILIKE ${like} OR EXISTS (SELECT 1 FROM comments cm WHERE cm.card_id = c.id AND cm.body ILIKE ${like}))`;
        break;
      }
      case 'member':
        cond =
          t.value === 'me'
            ? `EXISTS (SELECT 1 FROM card_members x WHERE x.card_id = c.id AND x.user_id = ${p(userId)})`
            : `EXISTS (SELECT 1 FROM card_members x JOIN users xu ON xu.id = x.user_id WHERE x.card_id = c.id AND xu.username = ${p(t.value)})`;
        break;
      case 'label':
        cond = `EXISTS (SELECT 1 FROM card_labels x JOIN labels xl ON xl.id = x.label_id WHERE x.card_id = c.id AND (lower(xl.name) = ${p(t.value)} OR xl.color = ${p(t.value)}))`;
        break;
      case 'board':
        cond = `b.name ILIKE ${p(`%${t.value}%`)}`;
        break;
      case 'list':
        cond = `l.name ILIKE ${p(`%${t.value}%`)}`;
        break;
      case 'due': {
        const v = t.value;
        if (v === 'overdue') cond = `(c.due_at < now() AND NOT c.due_complete)`;
        else if (v === 'none') cond = `c.due_at IS NULL`;
        else if (v === 'complete') cond = `c.due_complete`;
        else {
          const days = v === 'day' ? 1 : v === 'week' ? 7 : v === 'month' ? 30 : Number.parseInt(v, 10);
          if (Number.isFinite(days) && days > 0) cond = `(c.due_at >= now() AND c.due_at < now() + make_interval(days => ${p(days)}))`;
        }
        break;
      }
      case 'has':
        if (t.value === 'attachments') cond = `EXISTS (SELECT 1 FROM attachments x WHERE x.card_id = c.id)`;
        else if (t.value === 'description') cond = `c.description <> ''`;
        else if (t.value === 'checklists') cond = `EXISTS (SELECT 1 FROM checklists x WHERE x.card_id = c.id)`;
        else if (t.value === 'members') cond = `EXISTS (SELECT 1 FROM card_members x WHERE x.card_id = c.id)`;
        else if (t.value === 'comments') cond = `EXISTS (SELECT 1 FROM comments x WHERE x.card_id = c.id)`;
        break;
      case 'is':
        if (t.value === 'archived') {
          includeArchived = true;
          cond = t.negate ? null : `(c.archived_at IS NOT NULL OR l.archived_at IS NOT NULL)`;
          if (t.negate) includeArchived = false;
          continue;
        } else if (t.value === 'open') cond = `(c.archived_at IS NULL AND l.archived_at IS NULL)`;
        else if (t.value === 'complete') cond = `c.due_complete`;
        else if (t.value === 'incomplete') cond = `NOT c.due_complete`;
        else if (t.value === 'starred') cond = `EXISTS (SELECT 1 FROM board_stars x WHERE x.board_id = b.id AND x.user_id = ${p(userId)})`;
        break;
    }
    if (cond) where.push(t.negate ? `NOT ${cond}` : cond);
  }
  return { where, includeArchived };
}
