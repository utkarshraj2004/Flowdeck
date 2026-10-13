import { useCallback, useEffect, useState } from 'react';
import { del, get, patch, post } from '../api';
import { timeAgo } from '../components/ui';
import { copyText } from '../components/clipboard';
import { useBoard } from './context';
import { byPos } from './store';

type Trigger = { type: 'card_added'; listId: string | null } | { type: 'card_moved'; listId: string } | { type: 'card_completed' } | { type: 'due_soon'; hours: number };
type Action =
  | { type: 'move_to_list'; listId: string; position: 'top' | 'bottom' }
  | { type: 'add_label' | 'remove_label'; labelId: string }
  | { type: 'add_member' | 'remove_member'; userId: string }
  | { type: 'set_complete'; complete: boolean }
  | { type: 'set_due'; days: number }
  | { type: 'archive' };
interface Rule {
  id: string;
  name: string;
  trigger: Trigger;
  actions: Action[];
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

const ACTION_LABEL: Record<Action['type'], string> = {
  move_to_list: 'Move the card to list',
  add_label: 'Add label',
  remove_label: 'Remove label',
  add_member: 'Add member',
  remove_member: 'Remove member',
  set_complete: 'Mark complete',
  set_due: 'Set due date to N days from now',
  archive: 'Archive the card',
};

function useNames() {
  const { state } = useBoard();
  const list = (id: string | null) => (id ? (state.lists[id]?.name ?? 'a deleted list') : 'any list');
  const label = (id: string) => {
    const l = state.labels.find((x) => x.id === id);
    return l ? l.name || l.color || 'label' : 'a deleted label';
  };
  const member = (id: string) => state.members.find((m) => m.id === id)?.fullName ?? 'a former member';
  return { list, label, member };
}
type Names = ReturnType<typeof useNames>;

function describeTrigger(t: Trigger, n: Names) {
  switch (t.type) {
    case 'card_added':
      return `When a card is added to ${t.listId ? `“${n.list(t.listId)}”` : 'any list'}`;
    case 'card_moved':
      return `When a card is moved into “${n.list(t.listId)}”`;
    case 'card_completed':
      return 'When a card is marked complete';
    case 'due_soon':
      return `When a card is due within ${t.hours} hour${t.hours === 1 ? '' : 's'}`;
  }
}

function describeAction(a: Action, n: Names) {
  switch (a.type) {
    case 'move_to_list':
      return `move it to the ${a.position} of “${n.list(a.listId)}”`;
    case 'add_label':
      return `add label “${n.label(a.labelId)}”`;
    case 'remove_label':
      return `remove label “${n.label(a.labelId)}”`;
    case 'add_member':
      return `add ${n.member(a.userId)}`;
    case 'remove_member':
      return `remove ${n.member(a.userId)}`;
    case 'set_complete':
      return a.complete ? 'mark it complete' : 'mark it incomplete';
    case 'set_due':
      return `set the due date to ${a.days} day${a.days === 1 ? '' : 's'} from now`;
    case 'archive':
      return 'archive it';
  }
}

/** Board automation: everyone on the board can read the rules; board admins create, switch and delete them. */
export function AutomationPanel() {
  const { state, run } = useBoard();
  const names = useNames();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const canEdit = state.access.can.admin && !state.board.closedAt;
  const load = useCallback(() => {
    get(`/boards/${state.board.id}/automations`)
      .then((r) => setRules(r.rules))
      .catch((e) => setError((e as Error).message));
  }, [state.board.id]);
  useEffect(load, [load]);

  if (error) return <p role="alert">{error}</p>;
  if (!rules) return <p aria-busy="true">Loading rules…</p>;
  return (
    <div className="stack automation">
      <p className="muted">
        Rules run on the server as part of the change that triggers them, and their changes show in the activity with the rule’s name. If a rule cannot run, the change that
        triggered it is still saved and the failure is shown here and in the activity. Rules never trigger other rules.
      </p>
      {rules.length === 0 && <p>No rules yet.{canEdit ? '' : ' Board admins can add them.'}</p>}
      {rules.length > 0 && (
        <ul className="rule-list" aria-label="Rules">
          {rules.map((r) => (
            <li key={r.id} className={`rule ${r.enabled ? '' : 'off'}`}>
              <div className="rule-head">
                <strong>{r.name}</strong>
                {!r.enabled && <span className="pill">Off</span>}
              </div>
              <p>
                {describeTrigger(r.trigger, names)}: {r.actions.map((a) => describeAction(a, names)).join(', then ')}.
              </p>
              <p className="muted small">
                Ran {r.runCount} time{r.runCount === 1 ? '' : 's'}
                {r.lastRunAt ? `, last ${timeAgo(r.lastRunAt)}` : ''}
              </p>
              {r.lastError && (
                <p className="rule-error">
                  Last failure
                  {r.lastErrorAt ? ` (${timeAgo(r.lastErrorAt)})` : ''}: {r.lastError}
                </p>
              )}
              {canEdit && (
                <div className="row">
                  <button
                    className="btn btn-small"
                    onClick={async () =>
                      (await run(
                        () =>
                          patch(`/automations/${r.id}`, {
                            enabled: !r.enabled,
                          }),
                        r.enabled ? 'Rule switched off' : 'Rule switched on',
                      )) && load()
                    }
                  >
                    {r.enabled ? 'Switch off' : 'Switch on'}
                  </button>
                  <button
                    className="btn btn-small danger-text"
                    aria-label={`Delete rule ${r.name}`}
                    onClick={async () => (await run(() => del(`/automations/${r.id}`), 'Rule deleted')) && load()}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !creating && (
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Add a rule
        </button>
      )}
      {canEdit && creating && (
        <RuleForm
          onDone={(saved) => {
            setCreating(false);
            if (saved) load();
          }}
        />
      )}
    </div>
  );
}

function RuleForm({ onDone }: { onDone: (saved: boolean) => void }) {
  const { state } = useBoard();
  const lists = Object.values(state.lists)
    .filter((l) => !l.archivedAt)
    .sort(byPos);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<Trigger>({
    type: 'card_moved',
    listId: lists[lists.length - 1]?.id ?? '',
  });
  const [actions, setActions] = useState<Action[]>([{ type: 'set_complete', complete: true }]);
  const [error, setError] = useState('');

  const defaultAction = (type: Action['type']): Action => {
    switch (type) {
      case 'move_to_list':
        return { type, listId: lists[0]?.id ?? '', position: 'bottom' };
      case 'add_label':
      case 'remove_label':
        return { type, labelId: state.labels[0]?.id ?? '' };
      case 'add_member':
      case 'remove_member':
        return { type, userId: state.members[0]?.id ?? '' };
      case 'set_complete':
        return { type, complete: true };
      case 'set_due':
        return { type, days: 3 };
      case 'archive':
        return { type };
    }
  };
  const setAction = (i: number, a: Action) => setActions((xs) => xs.map((x, j) => (j === i ? a : x)));
  const listSelect = (value: string, onChange: (v: string) => void, label: string, allowAny = false) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAny && <option value="">any list</option>}
      {lists.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );

  return (
    <form
      className="stack rule-form"
      aria-label="New rule"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await post(`/boards/${state.board.id}/automations`, {
            name,
            trigger,
            actions,
          });
          onDone(true);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="field">
        <span>Rule name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="For example: Done means complete" />
      </label>
      <fieldset>
        <legend>When</legend>
        <div className="row wrap">
          <select
            aria-label="Trigger"
            value={trigger.type}
            onChange={(e) => {
              const type = e.target.value as Trigger['type'];
              setTrigger(
                type === 'card_added'
                  ? { type, listId: null }
                  : type === 'card_moved'
                    ? { type, listId: lists[0]?.id ?? '' }
                    : type === 'due_soon'
                      ? { type, hours: 24 }
                      : { type },
              );
            }}
          >
            <option value="card_added">a card is added to a list</option>
            <option value="card_moved">a card is moved into a list</option>
            <option value="card_completed">a card is marked complete</option>
            <option value="due_soon">a card is due soon</option>
          </select>
          {trigger.type === 'card_added' && listSelect(trigger.listId ?? '', (v) => setTrigger({ type: 'card_added', listId: v || null }), 'Trigger list', true)}
          {trigger.type === 'card_moved' && listSelect(trigger.listId, (v) => setTrigger({ type: 'card_moved', listId: v }), 'Trigger list')}
          {trigger.type === 'due_soon' && (
            <label className="inline-field">
              within{' '}
              <input
                type="number"
                min={1}
                max={336}
                value={trigger.hours}
                aria-label="Hours before due"
                onChange={(e) =>
                  setTrigger({
                    type: 'due_soon',
                    hours: Number(e.target.value),
                  })
                }
              />{' '}
              hours
            </label>
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend>Then</legend>
        <ol className="stack action-list">
          {actions.map((a, i) => (
            <li key={i} className="row wrap">
              <select aria-label={`Action ${i + 1}`} value={a.type} onChange={(e) => setAction(i, defaultAction(e.target.value as Action['type']))}>
                {(Object.keys(ACTION_LABEL) as Action['type'][]).map((t) => (
                  <option key={t} value={t}>
                    {ACTION_LABEL[t]}
                  </option>
                ))}
              </select>
              {a.type === 'move_to_list' && (
                <>
                  {listSelect(a.listId, (v) => setAction(i, { ...a, listId: v }), `Action ${i + 1} list`)}
                  <select
                    aria-label={`Action ${i + 1} position`}
                    value={a.position}
                    onChange={(e) =>
                      setAction(i, {
                        ...a,
                        position: e.target.value as 'top' | 'bottom',
                      })
                    }
                  >
                    <option value="bottom">at the bottom</option>
                    <option value="top">at the top</option>
                  </select>
                </>
              )}
              {(a.type === 'add_label' || a.type === 'remove_label') && (
                <select aria-label={`Action ${i + 1} label`} value={a.labelId} onChange={(e) => setAction(i, { ...a, labelId: e.target.value })}>
                  {state.labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name || l.color || 'colourless label'}
                    </option>
                  ))}
                </select>
              )}
              {(a.type === 'add_member' || a.type === 'remove_member') && (
                <select aria-label={`Action ${i + 1} member`} value={a.userId} onChange={(e) => setAction(i, { ...a, userId: e.target.value })}>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              )}
              {a.type === 'set_due' && (
                <input type="number" min={0} max={365} value={a.days} aria-label={`Action ${i + 1} days`} onChange={(e) => setAction(i, { ...a, days: Number(e.target.value) })} />
              )}
              {actions.length > 1 && (
                <button type="button" className="btn btn-small" aria-label={`Remove action ${i + 1}`} onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
        {actions.length < 5 && (
          <button type="button" className="btn btn-small" onClick={() => setActions((xs) => [...xs, defaultAction('add_label')])}>
            Add another action
          </button>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit">
          Save rule
        </button>
        <button className="btn" type="button" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface Hook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  stats?: { pending: number; failed: number; lastDeliveredAt: string | null };
}
interface Delivery {
  id: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
}

const EVENT_CHOICES = ['card.created', 'card.updated', 'card.moved', 'card.archived', 'comment.added', 'card.label_added', 'card.member_added', 'list.created', 'attachment.added'];

/** Outgoing webhooks (board admins): add, pause, rotate the secret, read the delivery log, retry failures. */
export function WebhooksPanel() {
  const { state, run } = useBoard();
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; items: Delivery[] } | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    get(`/boards/${state.board.id}/webhooks`)
      .then((r) => {
        setHooks(r.webhooks);
        setAllowPrivate(r.allowPrivate);
      })
      .catch((e) => setError((e as Error).message));
  }, [state.board.id]);
  useEffect(load, [load]);
  const openLog = async (id: string) => {
    const r: any = await run(() => get(`/webhooks/${id}/deliveries`));
    if (r) setLog({ id, items: r.deliveries });
  };

  if (!hooks) return error ? <p role="alert">{error}</p> : <p aria-busy="true">Loading webhooks…</p>;
  return (
    <div className="stack webhooks">
      <p className="muted">
        Flowdeck sends a signed JSON POST for each board change you choose. Failed deliveries are retried for about 7 hours, then marked failed below. Check the{' '}
        <code>X-Flowdeck-Signature</code> header: HMAC-SHA256 of <code>timestamp.body</code> with the secret.
        {!allowPrivate && ' Addresses on private networks are blocked on this server.'}
      </p>
      {secret && (
        <div className="notice" role="status">
          <p>Copy the signing secret now; it is not shown again.</p>
          <code className="secret break">{secret}</code>{' '}
          <button className="btn btn-small" onClick={() => copyText(secret)}>
            Copy secret
          </button>
        </div>
      )}
      {hooks.length > 0 && (
        <ul className="rule-list" aria-label="Webhooks">
          {hooks.map((h) => (
            <li key={h.id} className={`rule ${h.enabled ? '' : 'off'}`}>
              <div className="rule-head">
                <strong className="break">{h.url}</strong>
                {!h.enabled && <span className="pill">Paused</span>}
              </div>
              <p className="muted small">
                {h.events.length ? h.events.join(', ') : 'All board events'} · {h.stats?.pending ?? 0} pending · {h.stats?.failed ?? 0} failed
                {h.stats?.lastDeliveredAt ? ` · last delivered ${timeAgo(h.stats.lastDeliveredAt)}` : ''}
              </p>
              <div className="row wrap">
                <button className="btn btn-small" onClick={() => openLog(h.id)}>
                  Delivery log
                </button>
                <button className="btn btn-small" onClick={async () => (await run(() => post(`/webhooks/${h.id}/ping`), 'Test delivery queued')) && openLog(h.id)}>
                  Send test
                </button>
                <button className="btn btn-small" onClick={async () => (await run(() => patch(`/webhooks/${h.id}`, { enabled: !h.enabled }))) && load()}>
                  {h.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="btn btn-small"
                  onClick={async () => {
                    const r: any = await run(() => patch(`/webhooks/${h.id}`, { rotateSecret: true }), 'New secret created');
                    if (r?.webhook.secret) setSecret(r.webhook.secret);
                  }}
                >
                  New secret
                </button>
                <button className="btn btn-small danger-text" onClick={async () => (await run(() => del(`/webhooks/${h.id}`), 'Webhook deleted')) && load()}>
                  Delete
                </button>
              </div>
              {log?.id === h.id && (
                <table className="delivery-log">
                  <caption>Recent deliveries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Status</th>
                      <th scope="col">Tries</th>
                      <th scope="col">Result</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.items.length === 0 && (
                      <tr>
                        <td colSpan={5}>No deliveries yet.</td>
                      </tr>
                    )}
                    {log.items.map((d) => (
                      <tr key={d.id}>
                        <td>{d.event}</td>
                        <td>{d.status === 'pending' && d.attempts > 0 && d.nextAttemptAt ? `retrying (next ${timeAgo(d.nextAttemptAt)})` : d.status}</td>
                        <td>{d.attempts}</td>
                        <td className="break">{d.lastError ?? (d.lastStatus ? `HTTP ${d.lastStatus}` : '')}</td>
                        <td>
                          {d.status === 'failed' && (
                            <button
                              className="btn btn-small"
                              onClick={async () => (await run(() => post(`/webhooks/${h.id}/deliveries/${d.id}/retry`), 'Retrying')) && openLog(h.id)}
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="stack"
        aria-label="New webhook"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const r = await post(`/boards/${state.board.id}/webhooks`, {
              url,
              events,
            });
            setSecret(r.webhook.secret);
            setUrl('');
            setEvents([]);
            load();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="field">
          <span>Payload URL</span>
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/flowdeck-hook" />
        </label>
        <fieldset>
          <legend>Events (none selected means all)</legend>
          <div className="check-grid">
            {EVENT_CHOICES.map((ev) => (
              <label key={ev}>
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents((xs) => (e.target.checked ? [...xs, ev] : xs.filter((x) => x !== ev)))} /> {ev}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit">
          Add webhook
        </button>
      </form>
    </div>
  );
}
