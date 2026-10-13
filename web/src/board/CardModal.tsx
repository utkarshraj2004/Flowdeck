import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, del, get, patch, post, put } from '../api';
import { useAuth } from '../auth';
import { realtime } from '../realtime';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToasts } from '../components/Toasts';
import { Avatar, bytes, DUE_TEXT, dueState, formatDate, LABEL_COLORS, LabelChip, Markdown, timeAgo } from '../components/ui';
import { useBoard } from './context';
import { describeActivity, type BoardEvent } from './store';

type Detail = any;
type Panel = null | 'members' | 'labels' | 'dates' | 'checklist' | 'attachment' | 'cover' | 'move' | 'copy';

/**
 * Card detail dialog. Unsaved edits are handled explicitly: drafts are never
 * overwritten by other people's saves, a notice appears when someone else
 * saves the field you are editing, a conflicting save opens a choice instead
 * of silently overwriting, and closing with unsaved text asks first
 * (research J07.9, J08.10, J08.11).
 */
export function CardModal({ number, onClose }: { number: number; onClose: () => void }) {
  const { state, onEvent, run } = useBoard();
  const { push } = useToasts();
  const nav = useNavigate();
  const [card, setCard] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [gone, setGone] = useState<null | { by: string; moved?: boolean }>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drafts = useRef<Record<string, string>>({});
  const lastEditor = useRef<Record<string, string>>({});
  const can = state.access.can;
  const memberName = (id: string | null) => state.members.find((m) => m.id === id)?.fullName ?? 'Someone';

  const load = useCallback(async () => {
    try {
      const r = await get(`/boards/${state.board.id}/cards/${number}`);
      setCard(r.card);
      document.title = `${r.card.name} · ${state.board.name} · Flowdeck`;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setCard((c: Detail) => (c ? c : (setMissing(true), c)));
      else push({ kind: 'error', text: (e as Error).message });
    }
  }, [state.board.id, state.board.name, number, push]);

  useEffect(() => {
    load();
  }, [load]);

  const cardId = card?.id;
  useEffect(() => {
    if (!cardId) return;
    return onEvent((e: BoardEvent) => {
      const id = e.data?.cardId ?? e.data?.card?.id;
      if (id !== cardId) return;
      if (e.event === 'card.deleted') return setGone({ by: memberName(e.actor) });
      if (e.event === 'card.moved_out') return setGone({ by: memberName(e.actor), moved: true });
      if (e.event === 'card.updated') for (const f of e.data.changed ?? []) lastEditor.current[f] = memberName(e.actor);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, onEvent, load]);

  const dirty = () => Object.values(drafts.current).some((d) => d.trim() !== '');
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const requestClose = () => (dirty() && !gone ? setConfirmClose(true) : onClose());

  if (missing)
    return (
      <Modal title="Card not found" onClose={onClose} className="modal-small">
        <div className="modal-body">This card doesn’t exist on this board, or it was deleted.</div>
      </Modal>
    );
  if (!card)
    return (
      <Modal title="Loading card" onClose={onClose} className="card-modal">
        <div className="modal-body">
          <div className="skeleton" style={{ height: 32, width: '60%' }} />
          <div className="skeleton" style={{ height: 120, marginTop: 16 }} />
        </div>
      </Modal>
    );

  const editable = can.edit && !card.archivedAt && !gone;
  const labels = state.labels.filter((l) => card.labelIds.includes(l.id));
  const members = state.members.filter((m) => card.memberIds.includes(m.id));
  const ds = dueState(card.dueAt, card.dueComplete);
  const coverAttachment = card.cover?.attachmentId ? card.attachments.find((a: any) => a.id === card.cover.attachmentId) : null;
  const act = async (fn: () => Promise<any>, ok?: string) => {
    const r = await run(fn, ok);
    load();
    return r;
  };
  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f, f.name);
      await act(() => post(`/cards/${card.id}/attachments`, fd), `Attached ${f.name}`);
    }
  };

  return (
    <Modal onClose={requestClose} className="card-modal" labelledBy="card-title">
      <div
        className={`card-detail ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          if (editable && e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!editable || !e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          if (editable && e.clipboardData.files.length) {
            e.preventDefault();
            upload(e.clipboardData.files);
          }
        }}
      >
        {card.cover?.color && <div className={`detail-cover label-${card.cover.color}`} />}
        {coverAttachment && <img className="detail-cover-img" src={coverAttachment.url} alt="" />}
        <div className="detail-head">
          <TitleEditor card={card} editable={editable} drafts={drafts} lastEditor={lastEditor} reload={load} />
          <button className="icon-btn close-btn" aria-label="Close card" onClick={requestClose}>
            ×
          </button>
        </div>
        <p className="muted small detail-sub">
          #{card.number} in list <strong>{card.list?.name}</strong>
          {card.list?.archived ? ' (archived list)' : ''} · {state.board.name}
        </p>

        {gone && (
          <div className="banner banner-danger" role="alert">
            {gone.moved ? `${gone.by} moved this card to another board.` : `${gone.by} deleted this card.`} Your unsaved text is still here.
            {dirty() && (
              <button
                className="btn btn-small btn-light"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(Object.values(drafts.current).filter(Boolean).join('\n\n'))
                    .then(() => push({ kind: 'success', text: 'Draft copied to the clipboard' }))
                }
              >
                Copy draft
              </button>
            )}
          </div>
        )}
        {card.archivedAt && !gone && (
          <div className="banner banner-warn" role="status">
            This card is archived.
            {can.edit && (
              <>
                <button className="btn btn-small btn-light" onClick={() => act(() => post(`/cards/${card.id}/restore`), 'Card restored')}>
                  Restore
                </button>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() =>
                    setConfirm({
                      title: 'Delete card?',
                      body: 'The card, its comments, checklists, attachments and activity will be permanently deleted. There is no undo.',
                      label: 'Delete card',
                      run: async () => {
                        const r = await run(() => del(`/cards/${card.id}`));
                        if (r) onClose();
                      },
                    })
                  }
                >
                  Delete…
                </button>
              </>
            )}
          </div>
        )}

        <div className="detail-grid">
          <div className="detail-main">
            {(labels.length > 0 || members.length > 0 || card.dueAt || card.startAt) && (
              <div className="detail-meta">
                {members.length > 0 && (
                  <div>
                    <h3>Members</h3>
                    <div className="row">
                      {members.map((m) => (
                        <Avatar key={m.id} user={m} />
                      ))}
                    </div>
                  </div>
                )}
                {labels.length > 0 && (
                  <div>
                    <h3>Labels</h3>
                    <div className="row wrap">
                      {labels.map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                    </div>
                  </div>
                )}
                {(card.dueAt || card.startAt) && (
                  <div>
                    <h3>Dates</h3>
                    <label className="row">
                      {card.dueAt && (
                        <input
                          type="checkbox"
                          checked={card.dueComplete}
                          disabled={!editable}
                          onChange={(e) => act(() => patch(`/cards/${card.id}`, { dueComplete: e.target.checked }))}
                          aria-label="Mark complete"
                        />
                      )}
                      <span>
                        {card.startAt && `${formatDate(card.startAt, false)} – `}
                        {card.dueAt && formatDate(card.dueAt)}
                      </span>
                      {card.dueAt && <span className={`badge due-${ds}`}>{DUE_TEXT[ds]}</span>}
                    </label>
                  </div>
                )}
              </div>
            )}

            <DescriptionEditor card={card} editable={editable} drafts={drafts} lastEditor={lastEditor} reload={load} />

            {card.checklists.map((cl: any) => (
              <Checklist key={cl.id} cl={cl} editable={editable} act={act} onDelete={() => setConfirm({ title: `Delete checklist “${cl.name}”?`, body: 'Its items will be deleted. There is no undo.', label: 'Delete checklist', run: () => act(() => del(`/checklists/${cl.id}`)) })} />
            ))}

            {card.attachments.length > 0 && (
              <section className="detail-section">
                <h3>Attachments</h3>
                <ul className="attachments">
                  {card.attachments.map((a: any) => (
                    <li key={a.id} className="attachment">
                      {a.isImage ? <img src={a.url} alt="" className="att-thumb" loading="lazy" /> : <span className="att-icon">{a.kind === 'link' ? '🔗' : '📄'}</span>}
                      <div className="grow">
                        <a href={a.kind === 'link' ? a.url : `${a.url}?download=1`} target={a.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer nofollow">
                          {a.name}
                        </a>
                        <div className="muted small">
                          {a.kind === 'file' ? `${bytes(a.bytes)} · ` : ''}
                          {a.uploader?.fullName ?? 'Someone'} · {timeAgo(a.createdAt)}
                        </div>
                      </div>
                      {editable && a.isImage && (
                        <button className="btn btn-small btn-light" onClick={() => act(() => patch(`/cards/${card.id}`, { cover: card.cover?.attachmentId === a.id ? null : { attachmentId: a.id } }))}>
                          {card.cover?.attachmentId === a.id ? 'Remove cover' : 'Make cover'}
                        </button>
                      )}
                      {editable && (
                        <button className="btn btn-small btn-light" onClick={() => setConfirm({ title: `Remove ${a.name}?`, body: 'The attachment will be permanently removed.', label: 'Remove', run: () => act(() => del(`/attachments/${a.id}`)) })}>
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="detail-section">
              <div className="row between">
                <h3>Comments and activity</h3>
                <button className="btn btn-small btn-light" aria-pressed={showDetails} onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
              </div>
              {can.comment && !gone && <CommentComposer cardId={card.id} drafts={drafts} reload={load} />}
              {!can.comment && <p className="muted small">Commenting is turned off for your role on this board.</p>}
              <Feed card={card} showDetails={showDetails} reload={load} setConfirm={setConfirm} />
            </section>
          </div>

          <aside className="detail-side" aria-label="Card actions">
            {editable && (
              <>
                <h3>Add to card</h3>
                <button className="btn btn-light side-btn" aria-expanded={panel === 'members'} onClick={() => setPanel(panel === 'members' ? null : 'members')}>
                  Members
                </button>
                {panel === 'members' && <MembersPanel card={card} act={act} />}
                <button className="btn btn-light side-btn" aria-expanded={panel === 'labels'} onClick={() => setPanel(panel === 'labels' ? null : 'labels')}>
                  Labels
                </button>
                {panel === 'labels' && <LabelsPanel card={card} act={act} />}
                <button className="btn btn-light side-btn" aria-expanded={panel === 'checklist'} onClick={() => setPanel(panel === 'checklist' ? null : 'checklist')}>
                  Checklist
                </button>
                {panel === 'checklist' && (
                  <form
                    className="side-panel stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await act(() => post(`/cards/${card.id}/checklists`, { name: new FormData(e.currentTarget).get('name') }));
                      setPanel(null);
                    }}
                  >
                    <label className="field">
                      <span>Checklist title</span>
                      <input name="name" defaultValue="Checklist" maxLength={200} autoFocus />
                    </label>
                    <button className="btn btn-primary btn-small">Add checklist</button>
                  </form>
                )}
                <button className="btn btn-light side-btn" aria-expanded={panel === 'dates'} onClick={() => setPanel(panel === 'dates' ? null : 'dates')}>
                  Dates
                </button>
                {panel === 'dates' && <DatesPanel card={card} act={act} close={() => setPanel(null)} />}
                <button className="btn btn-light side-btn" aria-expanded={panel === 'attachment'} onClick={() => setPanel(panel === 'attachment' ? null : 'attachment')}>
                  Attachment
                </button>
                {panel === 'attachment' && (
                  <div className="side-panel stack">
                    <label className="field">
                      <span>Upload a file</span>
                      <input type="file" multiple onChange={(e) => e.target.files && upload(e.target.files).then(() => setPanel(null))} />
                    </label>
                    <p className="muted small">You can also drop files onto the card or paste them.</p>
                    <form
                      className="stack"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const r = await act(() => post(`/cards/${card.id}/attachments`, { url: f.get('url'), name: f.get('name') || undefined }));
                        if (r) setPanel(null);
                      }}
                    >
                      <label className="field">
                        <span>Or attach a link</span>
                        <input name="url" type="url" placeholder="https://…" required />
                      </label>
                      <label className="field">
                        <span>Link name (optional)</span>
                        <input name="name" maxLength={256} />
                      </label>
                      <button className="btn btn-primary btn-small">Attach link</button>
                    </form>
                  </div>
                )}
                <button className="btn btn-light side-btn" aria-expanded={panel === 'cover'} onClick={() => setPanel(panel === 'cover' ? null : 'cover')}>
                  Cover
                </button>
                {panel === 'cover' && (
                  <div className="side-panel stack">
                    <div className="swatches">
                      {LABEL_COLORS.map((c) => (
                        <button key={c} className={`swatch label-${c} ${card.cover?.color === c ? 'selected' : ''}`} aria-label={`${c} cover`} onClick={() => act(() => patch(`/cards/${card.id}`, { cover: { color: c } }))} />
                      ))}
                    </div>
                    {card.cover && (
                      <button className="btn btn-light btn-small" onClick={() => act(() => patch(`/cards/${card.id}`, { cover: null }))}>
                        Remove cover
                      </button>
                    )}
                    <p className="muted small">Image attachments can be set as the cover from the Attachments section.</p>
                  </div>
                )}
              </>
            )}
            <h3>Actions</h3>
            {editable && (
              <>
                <button className="btn btn-light side-btn" aria-expanded={panel === 'move'} onClick={() => setPanel(panel === 'move' ? null : 'move')}>
                  Move
                </button>
                {panel === 'move' && <MoveCopyPanel card={card} mode="move" onDone={(dest) => (dest ? nav(dest) : load(), setPanel(null))} />}
              </>
            )}
            {can.view && !gone && (
              <>
                <button className="btn btn-light side-btn" aria-expanded={panel === 'copy'} onClick={() => setPanel(panel === 'copy' ? null : 'copy')}>
                  Copy
                </button>
                {panel === 'copy' && <MoveCopyPanel card={card} mode="copy" onDone={(dest) => (dest ? nav(dest) : load(), setPanel(null))} />}
              </>
            )}
            {!gone && (
              <button className="btn btn-light side-btn" aria-pressed={card.watching} onClick={() => act(() => (card.watching ? del : put)(`/cards/${card.id}/watch`))}>
                {card.watching ? 'Watching ✓' : 'Watch'}
              </button>
            )}
            {editable && (
              <button
                className="btn btn-light side-btn"
                onClick={async () => {
                  const r: any = await act(() => post(`/cards/${card.id}/archive`));
                  if (r) push({ kind: 'info', text: 'Card archived.', action: { label: 'Undo', run: () => act(() => post(`/cards/${card.id}/restore`)) } });
                }}
              >
                Archive
              </button>
            )}
            <button
              className="btn btn-light side-btn"
              onClick={() => navigator.clipboard?.writeText(`${location.origin}/b/${state.board.shortId}/c/${card.number}`).then(() => push({ kind: 'success', text: 'Card link copied' }))}
            >
              Copy link
            </button>
          </aside>
        </div>
      </div>
      {confirmClose && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have text on this card that hasn’t been saved."
          confirmLabel="Discard changes"
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            drafts.current = {};
            setConfirmClose(false);
            onClose();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </Modal>
  );
}

type DraftRefs = { drafts: React.MutableRefObject<Record<string, string>>; lastEditor: React.MutableRefObject<Record<string, string>>; reload: () => Promise<void> };

function useEditingPresence(cardId: string, field: string, active: boolean) {
  const { state } = useBoard();
  useEffect(() => {
    if (!active) return;
    const send = (on: boolean) => realtime.send({ type: 'editing', board: state.board.id, cardId, field, active: on });
    send(true);
    const t = window.setInterval(() => send(true), 10_000);
    return () => {
      window.clearInterval(t);
      send(false);
    };
  }, [active, cardId, field, state.board.id]);
}

function OthersEditing({ cardId, field }: { cardId: string; field: string }) {
  const { editing } = useBoard();
  const { me } = useAuth();
  const others = (editing[`${cardId}:${field}`] ?? []).filter((u) => u.id !== me!.id);
  if (!others.length) return null;
  return (
    <span className="editing-pill" role="status">
      ✎ {others.map((u) => u.name).join(', ')} {others.length > 1 ? 'are' : 'is'} editing
    </span>
  );
}

function TitleEditor({ card, editable, drafts, lastEditor, reload }: { card: Detail; editable: boolean } & DraftRefs) {
  const { ingest } = useBoard();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<null | { theirs: string; by: string }>(null);
  const base = useRef('');
  useEditingPresence(card.id, 'name', draft !== null);
  const set = (v: string | null) => {
    setDraft(v);
    if (v === null || v === base.current) delete drafts.current.name;
    else drafts.current.name = v;
  };
  const save = async (value: string, againstBase: string) => {
    const name = value.trim();
    if (!name) return set(null);
    if (name.length > 512) return setError(`Titles can be at most 512 characters (${name.length}).`);
    if (name === againstBase) return set(null);
    try {
      const r = await patch(`/cards/${card.id}`, { name, base: { name: againstBase } });
      ingest(r.event);
      set(null);
      setConflict(null);
      setError('');
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') setConflict({ theirs: e.details.current.name, by: e.details.updatedBy ?? lastEditor.current.name ?? 'Someone' });
      else setError((e as Error).message);
    }
  };
  if (draft === null)
    return (
      <h2 id="card-title" className="detail-title">
        <button
          className="title-btn"
          disabled={!editable}
          onClick={() => {
            base.current = card.name;
            setDraft(card.name);
          }}
        >
          {card.name}
        </button>
        <OthersEditing cardId={card.id} field="name" />
      </h2>
    );
  return (
    <div className="detail-title-edit">
      <h2 id="card-title" className="visually-hidden">
        Editing title of {card.name}
      </h2>
      <textarea
        className="title-input"
        aria-label="Card title"
        value={draft}
        autoFocus
        rows={1}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save(draft, base.current);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            set(null);
            setConflict(null);
          }
        }}
        onBlur={() => !conflict && save(draft, base.current)}
      />
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      {conflict && (
        <div className="banner banner-warn" role="alert">
          {conflict.by} changed the title to “{conflict.theirs}” while you were editing.
          <button className="btn btn-small btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => save(draft, conflict.theirs)}>
            Keep mine
          </button>
          <button
            className="btn btn-small btn-light"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              set(null);
              setConflict(null);
              reload();
            }}
          >
            Use theirs
          </button>
        </div>
      )}
    </div>
  );
}

function DescriptionEditor({ card, editable, drafts, lastEditor, reload }: { card: Detail; editable: boolean } & DraftRefs) {
  const { ingest } = useBoard();
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<null | { base: string; theirs: string; mine: string; by: string }>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState('');
  const base = useRef('');
  const editingActive = draft !== null;
  useEditingPresence(card.id, 'description', editingActive);

  // Someone else saved the description while this user is editing: tell them at once (Trello shows nothing).
  useEffect(() => {
    if (editingActive && card.description !== base.current) setNotice(lastEditor.current.description ?? 'Someone');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.description]);

  const set = (v: string | null) => {
    setDraft(v);
    if (v === null) delete drafts.current.description;
    else if (v !== base.current) drafts.current.description = v;
    else delete drafts.current.description;
  };
  const stop = () => {
    set(null);
    setNotice(null);
    setConflict(null);
    setError('');
  };
  const save = async (text: string, against: string) => {
    if (text.length > 16384) return setError(`The description can be at most 16384 characters (${text.length}).`);
    try {
      const r = await patch(`/cards/${card.id}`, { description: text, base: { description: against } });
      ingest(r.event);
      stop();
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict')
        setConflict({ base: against, theirs: e.details.current.description, mine: text, by: e.details.updatedBy ?? 'Someone' });
      else setError((e as Error).message);
    }
  };
  const start = () => {
    base.current = card.description;
    set(card.description);
  };

  return (
    <section className="detail-section">
      <div className="row between">
        <h3>Description</h3>
        <OthersEditing cardId={card.id} field="description" />
        {editable && draft === null && card.description && (
          <button className="btn btn-small btn-light" onClick={start}>
            Edit
          </button>
        )}
      </div>
      {draft === null ? (
        card.description ? (
          <Markdown source={card.description} />
        ) : editable ? (
          <button className="placeholder-btn" onClick={start}>
            Add a more detailed description…
          </button>
        ) : (
          <p className="muted">No description.</p>
        )
      ) : (
        <div className="stack">
          {notice && (
            <div className="banner banner-warn" role="alert">
              {notice} updated the description while you were editing. Your draft is kept; saving will ask which version to keep.
              <button className="btn btn-small btn-light" onClick={() => setPreview(false)}>
                OK
              </button>
            </div>
          )}
          <div className="tabs small" role="tablist">
            <button role="tab" aria-selected={!preview} className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
              Write
            </button>
            <button role="tab" aria-selected={preview} className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
              Preview
            </button>
            {draft !== base.current && <span className="pill">Unsaved changes</span>}
          </div>
          {preview ? (
            <Markdown source={draft || '_Nothing to preview_'} className="preview" />
          ) : (
            <textarea
              className="desc-input"
              aria-label="Description (Markdown)"
              value={draft}
              autoFocus
              rows={8}
              onChange={(e) => set(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save(draft, base.current);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  if (draft !== base.current) setConfirmCancel(true);
                  else stop();
                }
              }}
            />
          )}
          {error && (
            <div className="field-error" role="alert">
              {error}
            </div>
          )}
          <div className="row">
            <button className="btn btn-primary btn-small" onClick={() => save(draft, base.current)}>
              Save
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => (draft !== base.current ? setConfirmCancel(true) : stop())}>
              Cancel
            </button>
            <span className="muted small">Markdown supported · Ctrl+Enter saves</span>
          </div>
        </div>
      )}
      {conflict && (
        <Modal title="The description changed while you were editing" onClose={() => setConflict(null)} className="conflict-modal">
          <div className="modal-body stack">
            <p>
              <strong>{conflict.by}</strong> saved a different description after you started editing. Choose which version to keep — nothing has been overwritten yet.
            </p>
            <div className="conflict-grid">
              <div>
                <h4>Their saved version</h4>
                <pre className="conflict-text">{conflict.theirs || '(empty)'}</pre>
              </div>
              <div>
                <h4>Your version</h4>
                <pre className="conflict-text">{conflict.mine || '(empty)'}</pre>
              </div>
            </div>
            <details>
              <summary>The version you started from</summary>
              <pre className="conflict-text">{conflict.base || '(empty)'}</pre>
            </details>
            <div className="row wrap end">
              <button
                className="btn btn-light"
                onClick={() => {
                  stop();
                  reload();
                }}
              >
                Discard mine, keep theirs
              </button>
              <button
                className="btn btn-light"
                onClick={() => {
                  // Continue editing, now knowingly based on their version.
                  base.current = conflict.theirs;
                  set(`${conflict.mine}\n\n---\n${conflict.theirs}`);
                  setConflict(null);
                  setNotice(null);
                }}
              >
                Combine and edit
              </button>
              <button className="btn btn-primary" onClick={() => save(conflict.mine, conflict.theirs)}>
                Keep mine (replace theirs)
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="Discard your changes to the description?"
          body="Your unsaved text will be lost."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            stop();
          }}
        />
      )}
    </section>
  );
}

function Checklist({ cl, editable, act, onDelete }: { cl: any; editable: boolean; act: (fn: () => Promise<any>, ok?: string) => Promise<any>; onDelete: () => void }) {
  const [hideChecked, setHideChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editItem, setEditItem] = useState<string | null>(null);
  const done = cl.items.filter((i: any) => i.checked).length;
  const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
  const ref = useRef<HTMLInputElement>(null);
  return (
    <section className="detail-section" aria-label={`Checklist ${cl.name}`}>
      <div className="row between">
        {renaming ? (
          <input
            defaultValue={cl.name}
            aria-label="Checklist title"
            autoFocus
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') (e.stopPropagation(), setRenaming(false));
            }}
            onBlur={(e) => {
              setRenaming(false);
              const v = e.currentTarget.value.trim();
              if (v && v !== cl.name) act(() => patch(`/checklists/${cl.id}`, { name: v }));
            }}
          />
        ) : (
          <h3>
            <button className="title-btn" disabled={!editable} onClick={() => setRenaming(true)}>
              {cl.name}
            </button>
          </h3>
        )}
        <div className="row">
          {done > 0 && (
            <button className="btn btn-small btn-light" onClick={() => setHideChecked((h) => !h)}>
              {hideChecked ? `Show checked (${done})` : 'Hide checked'}
            </button>
          )}
          {editable && (
            <button className="btn btn-small btn-light" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${cl.name} progress`}>
        <span className="progress-text">{pct}%</span>
        <span className="progress-bar">
          <span style={{ width: `${pct}%` }} className={pct === 100 ? 'complete' : ''} />
        </span>
      </div>
      <ul className="check-items">
        {cl.items
          .filter((i: any) => !hideChecked || !i.checked)
          .map((i: any) => (
            <li key={i.id} className="check-item">
              <input type="checkbox" checked={i.checked} disabled={!editable} aria-label={i.name} onChange={(e) => act(() => patch(`/check-items/${i.id}`, { checked: e.target.checked }))} />
              {editItem === i.id ? (
                <input
                  className="grow"
                  defaultValue={i.name}
                  autoFocus
                  aria-label="Item text"
                  maxLength={1000}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') (e.stopPropagation(), setEditItem(null));
                  }}
                  onBlur={(e) => {
                    setEditItem(null);
                    const v = e.currentTarget.value.trim();
                    if (v && v !== i.name) act(() => patch(`/check-items/${i.id}`, { name: v }));
                  }}
                />
              ) : (
                <button className={`title-btn grow ${i.checked ? 'checked' : ''}`} disabled={!editable} onClick={() => setEditItem(i.id)}>
                  {i.name}
                </button>
              )}
              {editable && (
                <button className="icon-btn" aria-label={`Delete item ${i.name}`} onClick={() => act(() => del(`/check-items/${i.id}`))}>
                  ×
                </button>
              )}
            </li>
          ))}
      </ul>
      {editable &&
        (adding ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = ref.current!.value.trim();
              if (!v) return;
              await act(() => post(`/checklists/${cl.id}/items`, { name: v }));
              ref.current!.value = '';
              ref.current!.focus();
            }}
          >
            <input ref={ref} autoFocus aria-label="New item" placeholder="Add an item" maxLength={1000} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAdding(false))} />
            <div className="row">
              <button className="btn btn-primary btn-small">Add</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-small btn-light" onClick={() => setAdding(true)}>
            Add an item
          </button>
        ))}
    </section>
  );
}

function MembersPanel({ card, act }: { card: Detail; act: (fn: () => Promise<any>) => Promise<any> }) {
  const { state } = useBoard();
  return (
    <div className="side-panel stack" role="group" aria-label="Card members">
      {state.members.map((m) => {
        const on = card.memberIds.includes(m.id);
        return (
          <label key={m.id} className="row">
            <input type="checkbox" checked={on} onChange={() => act(() => (on ? del : put)(`/cards/${card.id}/members/${m.id}`))} />
            <Avatar user={m} size={22} /> {m.fullName}
          </label>
        );
      })}
    </div>
  );
}

function LabelsPanel({ card, act }: { card: Detail; act: (fn: () => Promise<any>) => Promise<any> }) {
  const { state, run } = useBoard();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [color, setColor] = useState<string | null>('green');
  const editLabel = editing && editing !== 'new' ? state.labels.find((l) => l.id === editing) : null;
  return (
    <div className="side-panel stack" role="group" aria-label="Labels">
      {editing ? (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name') ?? '');
            if (editing === 'new') {
              const r: any = await run(() => post(`/boards/${state.board.id}/labels`, { name, color }));
              if (r?.label) await act(() => put(`/cards/${card.id}/labels/${r.label.id}`));
            } else await run(() => patch(`/labels/${editing}`, { name, color }));
            setEditing(null);
          }}
        >
          <label className="field">
            <span>Label name</span>
            <input name="name" defaultValue={editLabel?.name ?? ''} maxLength={100} autoFocus />
          </label>
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {LABEL_COLORS.map((c) => (
              <button type="button" role="radio" aria-checked={color === c} key={c} className={`swatch label-${c} ${color === c ? 'selected' : ''}`} aria-label={c} onClick={() => setColor(c)} />
            ))}
            <button type="button" role="radio" aria-checked={color === null} className={`swatch label-none ${color === null ? 'selected' : ''}`} aria-label="No colour" onClick={() => setColor(null)} />
          </div>
          <div className="row">
            <button className="btn btn-primary btn-small">{editing === 'new' ? 'Create' : 'Save'}</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {editLabel && (
              <button type="button" className="btn btn-danger btn-small" onClick={() => run(() => del(`/labels/${editLabel.id}`)).then(() => setEditing(null))}>
                Delete label
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          {state.labels.map((l) => {
            const on = card.labelIds.includes(l.id);
            return (
              <div key={l.id} className="row">
                <label className="row grow">
                  <input type="checkbox" checked={on} onChange={() => act(() => (on ? del : put)(`/cards/${card.id}/labels/${l.id}`))} />
                  <LabelChip label={l} /> {!l.name && <span className="muted small">{l.color}</span>}
                </label>
                <button
                  className="icon-btn"
                  aria-label={`Edit label ${l.name || l.color}`}
                  onClick={() => {
                    setColor(l.color);
                    setEditing(l.id);
                  }}
                >
                  ✎
                </button>
              </div>
            );
          })}
          <button
            className="btn btn-light btn-small"
            onClick={() => {
              setColor('green');
              setEditing('new');
            }}
          >
            Create a new label
          </button>
        </>
      )}
    </div>
  );
}

const toLocalInput = (iso: string | null, withTime: boolean) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
};

function DatesPanel({ card, act, close }: { card: Detail; act: (fn: () => Promise<any>) => Promise<any>; close: () => void }) {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  return (
    <form
      className="side-panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const start = String(f.get('start') || '');
        const due = String(f.get('due') || '');
        const r = await act(() =>
          patch(`/cards/${card.id}`, {
            startAt: start ? new Date(`${start}T00:00`).toISOString() : null,
            dueAt: due ? new Date(due).toISOString() : null,
            base: { startAt: card.startAt, dueAt: card.dueAt },
          }),
        );
        if (r) close();
      }}
    >
      <label className="field">
        <span>Start date</span>
        <input type="date" name="start" defaultValue={toLocalInput(card.startAt, false)} />
      </label>
      <label className="field">
        <span>Due date</span>
        <input type="datetime-local" name="due" defaultValue={toLocalInput(card.dueAt ?? tomorrow, true)} />
      </label>
      <div className="row">
        <button className="btn btn-primary btn-small">Save</button>
        <button type="button" className="btn btn-light btn-small" onClick={() => act(() => patch(`/cards/${card.id}`, { startAt: null, dueAt: null })).then(close)}>
          Remove dates
        </button>
      </div>
    </form>
  );
}

function MoveCopyPanel({ card, mode, onDone }: { card: Detail; mode: 'move' | 'copy'; onDone: (dest?: string) => void }) {
  const { state, run } = useBoard();
  const [boards, setBoards] = useState<any[]>([{ id: state.board.id, name: state.board.name, shortId: state.board.shortId }]);
  const [boardId, setBoardId] = useState(state.board.id);
  const [lists, setLists] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [listId, setListId] = useState(card.listId);
  const [pos, setPos] = useState('bottom');
  useEffect(() => {
    get('/me/home').then((r) => setBoards(r.boards.filter((b: any) => !b.closedAt && (b.role === 'admin' || b.role === 'member'))));
  }, []);
  useEffect(() => {
    get(`/boards/${boardId}`).then((s) => {
      setLists(s.lists);
      setCards(s.cards);
      setListId((cur: string) => (s.lists.some((l: any) => l.id === cur) ? cur : s.lists[0]?.id));
    });
  }, [boardId]);
  const inList = cards
    .filter((c) => c.listId === listId && c.id !== card.id)
    .sort((a, b) => (a.position < b.position ? -1 : 1));
  return (
    <form
      className="side-panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const position = pos === 'bottom' ? 'bottom' : { afterId: pos === 'top' ? null : pos };
        const keep = ['checklists', 'labels', 'members', 'attachments', 'comments'].filter((k) => f.get(k) === 'on');
        const r: any =
          mode === 'move'
            ? await run(() => post(`/cards/${card.id}/move`, { listId, position }), 'Card moved')
            : await run(() => post(`/cards/${card.id}/copy`, { listId, position, name: f.get('name'), keep }), 'Card copied');
        if (!r) return;
        const b = boards.find((x) => x.id === boardId);
        if (mode === 'copy') onDone(`/b/${b?.shortId ?? state.board.shortId}/c/${r.card.number}`);
        else onDone(boardId !== state.board.id ? `/b/${b?.shortId}/c/${r.card.number}` : undefined);
      }}
    >
      {mode === 'copy' && (
        <>
          <label className="field">
            <span>Title</span>
            <input name="name" defaultValue={card.name} maxLength={512} required />
          </label>
          <fieldset>
            <legend>Keep</legend>
            {[
              ['checklists', `Checklists (${card.checklists.length})`],
              ['labels', `Labels (${card.labelIds.length})`],
              ['members', `Members (${card.memberIds.length})`],
              ['attachments', `Attachments (${card.attachments.length})`],
              ['comments', `Comments (${card.comments.length})`],
            ].map(([k, l]) => (
              <label key={k} className="row">
                <input type="checkbox" name={k} defaultChecked={k !== 'comments'} /> {l}
              </label>
            ))}
            <p className="muted small">Copied checklist items start unchecked.</p>
          </fieldset>
        </>
      )}
      <label className="field">
        <span>Board</span>
        <select aria-label="Destination board" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>List</span>
        <select aria-label="Destination list" value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Position</span>
        <select aria-label="Position in list" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="top">Top</option>
          {inList.map((c) => (
            <option key={c.id} value={c.id}>
              After “{c.name}”
            </option>
          ))}
          <option value="bottom">Bottom</option>
        </select>
      </label>
      {boardId !== state.board.id && <p className="muted small">Members who aren’t on the target board are removed from the card; labels are matched by name and colour.</p>}
      <button className="btn btn-primary btn-small">{mode === 'move' ? 'Move' : 'Create copy'}</button>
    </form>
  );
}

function CommentComposer({ cardId, drafts, reload }: { cardId: string; drafts: React.MutableRefObject<Record<string, string>>; reload: () => Promise<void> }) {
  const { state, ingest } = useBoard();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const update = (v: string) => {
    setText(v);
    if (v.trim()) drafts.current.comment = v;
    else delete drafts.current.comment;
    const caret = ref.current?.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(?:^|\s)@([a-z0-9_]*)$/i);
    setMention(m ? m[1].toLowerCase() : null);
  };
  const suggestions = mention !== null ? state.members.filter((m) => m.username.includes(mention) || m.fullName.toLowerCase().includes(mention)).slice(0, 6) : [];
  const insert = (username: string) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([a-z0-9_]*)$/i, `@${username} `);
    update(before + text.slice(caret));
    setMention(null);
    ref.current?.focus();
  };
  const submit = async () => {
    if (!text.trim()) return;
    try {
      const r = await post(`/cards/${cardId}/comments`, { body: text });
      ingest(r.event);
      update('');
      setError('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="comment-composer">
      <label className="visually-hidden" htmlFor={`comment-${cardId}`}>
        Write a comment
      </label>
      <textarea
        id={`comment-${cardId}`}
        ref={ref}
        placeholder="Write a comment… (type @ to mention someone)"
        value={text}
        rows={focused || text ? 3 : 1}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Enter' && suggestions.length && mention !== null) {
            e.preventDefault();
            insert(suggestions[0].username);
          } else if (e.key === 'Escape' && (mention !== null || text)) {
            e.stopPropagation();
            if (mention !== null) setMention(null);
            else ref.current?.blur();
          }
        }}
        aria-autocomplete="list"
      />
      {suggestions.length > 0 && (
        <ul className="mention-list" role="listbox" aria-label="Mention a board member">
          {suggestions.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m.username)}>
                <Avatar user={m} size={20} /> {m.fullName} <span className="muted">@{m.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      {(focused || text) && (
        <button className="btn btn-primary btn-small" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!text.trim()}>
          Save comment
        </button>
      )}
    </div>
  );
}

function Feed({ card, showDetails, reload, setConfirm }: { card: Detail; showDetails: boolean; reload: () => Promise<void>; setConfirm: (c: any) => void }) {
  const { me } = useAuth();
  const { state, run } = useBoard();
  const [editing, setEditing] = useState<string | null>(null);
  const items = [
    ...card.comments.map((c: any) => ({ kind: 'comment', at: c.createdAt, c })),
    ...(showDetails ? card.activity.filter((a: any) => a.type !== 'comment.added').map((a: any) => ({ kind: 'activity', at: a.createdAt, a })) : []),
  ].sort((x, y) => (x.at < y.at ? 1 : -1));
  const isAdmin = state.access.can.admin;
  const adminIds = new Set(state.members.filter((m) => m.role === 'admin').map((m) => m.id));
  return (
    <ul className="feed">
      {items.map((it) =>
        it.kind === 'comment' ? (
          <li key={it.c.id} className="feed-item">
            <Avatar user={it.c.author ?? { fullName: 'Deleted user', initials: '?' }} />
            <div className="grow">
              <div>
                <strong>{it.c.author?.fullName ?? 'Deleted user'}</strong> <span className="muted small">{timeAgo(it.c.createdAt)}</span>
                {it.c.editedAt && <span className="muted small"> (edited)</span>}
              </div>
              {editing === it.c.id ? (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const body = String(new FormData(e.currentTarget).get('body') ?? '');
                    const r = await run(() => patch(`/comments/${it.c.id}`, { body }));
                    if (r) {
                      setEditing(null);
                      reload();
                    }
                  }}
                >
                  <textarea name="body" defaultValue={it.c.body} rows={3} autoFocus aria-label="Edit comment" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(null))} />
                  <div className="row">
                    <button className="btn btn-primary btn-small">Save</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="comment-body">
                  <Markdown source={it.c.body} />
                </div>
              )}
              <div className="row small">
                {it.c.author?.id === me!.id && editing !== it.c.id && state.access.can.comment && (
                  <button className="link-btn" onClick={() => setEditing(it.c.id)}>
                    Edit
                  </button>
                )}
                {(it.c.author?.id === me!.id || (isAdmin && !adminIds.has(it.c.author?.id))) && (
                  <button
                    className="link-btn"
                    onClick={() =>
                      setConfirm({
                        title: 'Delete comment?',
                        body: 'The comment will be permanently deleted.',
                        label: 'Delete comment',
                        run: () => run(() => del(`/comments/${it.c.id}`)).then(() => reload()),
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </li>
        ) : (
          <li key={`a${it.a.seq}`} className="feed-item activity">
            <Avatar user={it.a.actor ?? { fullName: 'Someone', initials: '?' }} size={24} />
            <div>
              <strong>{it.a.actor?.fullName ?? 'Someone'}</strong> {describeActivity(it.a, { onCard: true })} <span className="muted small">{timeAgo(it.a.createdAt)}</span>
            </div>
          </li>
        ),
      )}
      {items.length === 0 && <li className="muted small">No comments yet.</li>}
    </ul>
  );
}
