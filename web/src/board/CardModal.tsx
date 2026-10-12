import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ApiError, del, get, patch, post, put } from '../api';
import { useAuth } from '../auth';
import { realtime } from '../realtime';
import { ConfirmDialog, Modal } from '../components/Modal';
import { MenuItems, Popover, usePopover } from '../components/Popover';
import {
  Activity,
  Archive,
  ArrowRight,
  ChevronDown,
  Circle,
  CircleCheck,
  Clock,
  Copy,
  Ellipsis,
  Eye,
  Image,
  LayoutTemplate,
  Link,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  SquareCheck,
  Tag,
  TextAlignStart,
  Trash2,
  Users,
  X,
} from '../components/icons';
import { useToasts } from '../components/Toasts';
import { Avatar, bytes, DUE_TEXT, dueState, formatDate, LabelChip, timeAgo } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { useBoard } from './context';
import { describeActivity, type BoardEvent } from './store';
import { AttachmentPicker, ChecklistPicker, CopyCardPicker, CoverPicker, DatesPicker, LabelsPicker, MembersPicker, MoveCardPicker } from './pickers';

type Detail = any;
type Pop = 'add' | 'labels' | 'dates' | 'checklist' | 'members' | 'attachment' | 'cover' | 'move' | 'copy' | 'actions';
type Act = (fn: () => Promise<any>, ok?: string, optimistic?: (c: Detail) => Detail) => Promise<any>;

/**
 * Card detail dialog. Unsaved edits are handled explicitly: drafts are never
 * overwritten by other people's saves, a notice appears when someone else
 * saves the field you are editing, a conflicting save opens a choice instead
 * of silently overwriting, and closing with unsaved text asks first
 * (research J07.9, J08.10, J08.11).
 */
export function CardModal({ number, onClose }: { number: number; onClose: () => void }) {
  const { state, onEvent, run, setWatching } = useBoard();
  const { push } = useToasts();
  const nav = useNavigate();
  const location = useLocation();
  const intent = (location.state ?? {}) as { edit?: 'title'; open?: 'checklist' };
  const [detail, setCard] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [gone, setGone] = useState<null | { by: string; moved?: boolean }>(null);
  const pop = usePopover<Pop>();
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drafts = useRef<Record<string, string>>({});
  const lastEditor = useRef<Record<string, string>>({});
  const checklistBtn = useRef<HTMLButtonElement>(null);
  const can = state.access.can;
  const memberName = (id: string | null) => state.members.find((m) => m.id === id)?.fullName ?? 'Someone';

  // Responses can arrive out of order; only the newest request may update the dialog.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const r = await get(`/boards/${state.board.id}/cards/${number}`);
      if (mine !== loadSeq.current) return;
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
  // Several events for this card in one burst (own action echo + websocket) cause one refresh, not one each.
  const loadTimer = useRef<number | undefined>(undefined);
  const loadSoon = useCallback(() => {
    if (loadTimer.current !== undefined) return;
    loadTimer.current = window.setTimeout(() => {
      loadTimer.current = undefined;
      load();
    }, 0);
  }, [load]);
  useEffect(() => () => window.clearTimeout(loadTimer.current), []);

  const cardId = detail?.id;
  useEffect(() => {
    if (!cardId) return;
    return onEvent((e: BoardEvent) => {
      const id = e.data?.cardId ?? e.data?.card?.id;
      if (id !== cardId) return;
      if (e.event === 'card.deleted') return setGone({ by: memberName(e.actor) });
      if (e.event === 'card.moved_out') return setGone({ by: memberName(e.actor), moved: true });
      if (e.event === 'card.updated') for (const f of e.data.changed ?? []) lastEditor.current[f] = memberName(e.actor);
      loadSoon();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, onEvent, loadSoon]);

  // Opened with a shortcut from the board (`-` adds a checklist).
  const openedChecklist = useRef(false);
  useEffect(() => {
    if (detail && intent.open === 'checklist' && !openedChecklist.current && checklistBtn.current) {
      openedChecklist.current = true;
      pop.show('checklist', checklistBtn.current);
    }
  }, [detail, intent.open, pop]);

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
  if (!detail)
    return (
      <Modal title="Loading card" onClose={onClose} className="card-modal">
        <div className="modal-body">
          <div className="skeleton" style={{ height: 32, width: '60%' }} />
          <div className="skeleton" style={{ height: 120, marginTop: 16 }} />
        </div>
      </Modal>
    );

  // The board copy of the card front is updated optimistically and by every event: prefer it for the fields it has.
  const front = state.cards[detail.id];
  const card: Detail = front
    ? { ...detail, name: front.name, listId: front.listId, labelIds: front.labelIds, memberIds: front.memberIds, startAt: front.startAt, dueAt: front.dueAt, dueComplete: front.dueComplete, cover: front.cover, isTemplate: front.isTemplate }
    : detail;
  const watching = front ? state.watchedCardIds.includes(card.id) : card.watching;
  const listName = state.lists[card.listId]?.name ?? card.list?.name;
  const editable = can.edit && !card.archivedAt && !gone;
  const labels = state.labels.filter((l) => card.labelIds.includes(l.id));
  const members = state.members.filter((m) => card.memberIds.includes(m.id));
  const ds = dueState(card.dueAt, card.dueComplete);
  const coverAttachment = card.cover?.attachmentId ? card.attachments.find((a: any) => a.id === card.cover.attachmentId) : null;
  const images = card.attachments.filter((a: any) => a.isImage).map((a: any) => ({ id: a.id, url: a.url, name: a.name }));
  const act: Act = async (fn, ok, optimistic) => {
    if (optimistic) setCard((c: Detail) => (c ? optimistic(c) : c));
    const r = await run(fn, ok);
    if (r === undefined) load();
    return r;
  };
  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f, f.name);
      await act(() => post(`/cards/${card.id}/attachments`, fd), `Attached ${f.name}`);
    }
  };
  const toggleComplete = () =>
    act(() => patch(`/cards/${card.id}`, { dueComplete: !card.dueComplete }), undefined, (c) => ({ ...c, dueComplete: !c.dueComplete }));
  const toggleWatch = async () => {
    const on = !watching;
    setWatching('card', card.id, on);
    const r = await run(() => (on ? put : del)(`/cards/${card.id}/watch`));
    if (!r) setWatching('card', card.id, !on);
    else setCard((c: Detail) => ({ ...c, watching: on }));
  };
  const archive = async () => {
    const r: any = await act(() => post(`/cards/${card.id}/archive`));
    if (r) push({ kind: 'info', text: 'Card archived.', action: { label: 'Undo', run: () => act(() => post(`/cards/${card.id}/restore`)) } });
  };
  const chip = (k: Pop, icon: React.ReactNode, text: string, ref?: React.Ref<HTMLButtonElement>) => (
    <button ref={ref} type="button" className="chip-btn" aria-expanded={pop.is(k)} onClick={pop.toggle(k)}>
      {icon} {text}
    </button>
  );

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
        <div className="detail-topbar">
          {editable ? (
            <button type="button" className="list-chip" aria-label={`In list ${listName}. Move card`} aria-expanded={pop.is('move')} onClick={pop.toggle('move')}>
              {listName} <ChevronDown size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className="list-chip static">{listName}</span>
          )}
          {card.isTemplate && (
            <span className="pill">
              <LayoutTemplate size={13} aria-hidden="true" /> Template
            </span>
          )}
          <span className="grow" />
          {editable && (
            <button type="button" className="icon-btn" aria-label="Cover" title="Cover" aria-expanded={pop.is('cover')} onClick={pop.toggle('cover')}>
              <Image size={18} />
            </button>
          )}
          {!gone && (
            <button type="button" className="icon-btn" aria-label="Card actions" title="Card actions" aria-expanded={pop.is('actions')} onClick={pop.toggle('actions')}>
              <Ellipsis size={18} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Close card" onClick={requestClose}>
            <X size={20} />
          </button>
        </div>

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
            <Archive size={16} aria-hidden="true" /> This card is archived.
            {can.edit && (
              <>
                <button className="btn btn-small btn-light" onClick={() => act(() => post(`/cards/${card.id}/restore`), 'Card restored')}>
                  <RotateCcw size={14} aria-hidden="true" /> Restore
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
                  <Trash2 size={14} aria-hidden="true" /> Delete…
                </button>
              </>
            )}
          </div>
        )}

        <div className="detail-columns">
          <div className="detail-main">
            <div className="detail-title-row">
              {!card.isTemplate && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!card.dueComplete}
                  aria-label="Mark complete"
                  className={`complete-toggle big ${card.dueComplete ? 'on' : ''}`}
                  disabled={!editable}
                  onClick={toggleComplete}
                >
                  {card.dueComplete ? <CircleCheck size={22} /> : <Circle size={22} />}
                </button>
              )}
              <TitleEditor card={card} editable={editable} drafts={drafts} lastEditor={lastEditor} reload={load} autoEdit={intent.edit === 'title'} />
            </div>
            <p className="muted small detail-sub">
              #{card.number} in list {listName}
              {card.list?.archived ? ' (archived list)' : ''}
            </p>

            {editable && (
              <div className="detail-actions" role="toolbar" aria-label="Add to card">
                {chip('add', <Plus size={16} aria-hidden="true" />, 'Add')}
                {chip('labels', <Tag size={16} aria-hidden="true" />, 'Labels')}
                {chip('dates', <Clock size={16} aria-hidden="true" />, 'Dates')}
                {chip('checklist', <SquareCheck size={16} aria-hidden="true" />, 'Checklist', checklistBtn)}
                {chip('members', <Users size={16} aria-hidden="true" />, 'Members')}
              </div>
            )}

            {(labels.length > 0 || members.length > 0 || card.dueAt || card.startAt) && (
              <div className="detail-meta">
                {members.length > 0 && (
                  <div>
                    <h3>Members</h3>
                    <div className="row wrap">
                      {members.map((m) => (
                        <Avatar key={m.id} user={m} size={32} />
                      ))}
                      {editable && (
                        <button type="button" className="round-add" aria-label="Add or remove members" onClick={pop.toggle('members')}>
                          <Plus size={16} />
                        </button>
                      )}
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
                      {editable && (
                        <button type="button" className="round-add" aria-label="Add or remove labels" onClick={pop.toggle('labels')}>
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {(card.dueAt || card.startAt) && (
                  <div>
                    <h3>{card.startAt && card.dueAt ? 'Dates' : card.dueAt ? 'Due date' : 'Start date'}</h3>
                    <div className="row">
                      {card.dueAt && <input type="checkbox" checked={!!card.dueComplete} disabled={!editable} onChange={toggleComplete} aria-label="Mark complete" />}
                      <button type="button" className="date-btn" disabled={!editable} onClick={pop.toggle('dates')} aria-label="Edit dates">
                        {card.startAt && `${formatDate(card.startAt, false)} – `}
                        {card.dueAt && formatDate(card.dueAt)}
                        {card.dueAt && <span className={`badge due-${ds}`}>{DUE_TEXT[ds]}</span>}
                        {editable && <ChevronDown size={14} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DescriptionEditor card={card} editable={editable} drafts={drafts} lastEditor={lastEditor} reload={load} />

            {card.attachments.length > 0 && <Attachments card={card} editable={editable} act={act} setConfirm={setConfirm} onAdd={pop.toggle('attachment')} />}

            {card.checklists.map((cl: any) => (
              <Checklist
                key={cl.id}
                cl={cl}
                card={card}
                editable={editable}
                act={act}
                setCard={setCard}
                onDelete={() =>
                  setConfirm({ title: `Delete checklist “${cl.name}”?`, body: 'Its items will be deleted. There is no undo.', label: 'Delete checklist', run: () => act(() => del(`/checklists/${cl.id}`)) })
                }
              />
            ))}
          </div>

          <aside className="detail-side" aria-label="Comments and activity">
            <div className="row between side-head">
              <h3>
                <MessageSquare size={16} aria-hidden="true" /> Comments and activity
              </h3>
              <button className="btn btn-small btn-light" aria-pressed={showDetails} onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? 'Hide details' : 'Show details'}
              </button>
            </div>
            {can.comment && !gone && <CommentComposer cardId={card.id} drafts={drafts} />}
            {!can.comment && <p className="muted small">Commenting is turned off for your role on this board.</p>}
            <Feed card={card} showDetails={showDetails} setConfirm={setConfirm} />
          </aside>
        </div>
      </div>

      {pop.is('add') && (
        <Popover anchor={pop.anchor} title="Add to card" onClose={pop.close}>
          <MenuItems label="Add to card">
            {(
              [
                ['labels', <Tag size={18} key="i" />, 'Labels', 'Organise and prioritise'],
                ['dates', <Clock size={18} key="i" />, 'Dates', 'Start and due dates'],
                ['checklist', <SquareCheck size={18} key="i" />, 'Checklist', 'Break the work into steps'],
                ['members', <Users size={18} key="i" />, 'Members', 'Assign people'],
                ['attachment', <Paperclip size={18} key="i" />, 'Attachment', 'Files and links'],
                ['cover', <Image size={18} key="i" />, 'Cover', 'A colour or an attached image'],
              ] as const
            ).map(([k, icon, label, desc]) => (
              <button key={k} role="menuitem" onClick={() => pop.show(k, pop.anchor!)}>
                {icon}
                <span>
                  {label}
                  <span className="menu-desc">{desc}</span>
                </span>
              </button>
            ))}
          </MenuItems>
        </Popover>
      )}
      {pop.is('actions') && (
        <Popover anchor={pop.anchor} title="Card actions" onClose={pop.close}>
          <MenuItems label="Card actions">
            {editable && (
              <button role="menuitem" onClick={() => pop.show('move', pop.anchor!)}>
                <ArrowRight size={16} aria-hidden="true" /> Move
              </button>
            )}
            <button role="menuitem" onClick={() => pop.show('copy', pop.anchor!)}>
              <Copy size={16} aria-hidden="true" /> Copy
            </button>
            {editable && (
              <button
                role="menuitemcheckbox"
                aria-checked={!!card.isTemplate}
                onClick={() => {
                  pop.close();
                  act(() => patch(`/cards/${card.id}`, { isTemplate: !card.isTemplate }), card.isTemplate ? 'This card is no longer a template' : 'This card is now a template');
                }}
              >
                <LayoutTemplate size={16} aria-hidden="true" /> Make template
              </button>
            )}
            <button role="menuitemcheckbox" aria-checked={!!watching} onClick={() => (pop.close(), toggleWatch())}>
              <Eye size={16} aria-hidden="true" /> Watch
            </button>
            <button
              role="menuitem"
              onClick={() => {
                pop.close();
                navigator.clipboard?.writeText(`${window.location.origin}/b/${state.board.shortId}/c/${card.number}`).then(() => push({ kind: 'success', text: 'Card link copied' }));
              }}
            >
              <Link size={16} aria-hidden="true" /> Copy link
            </button>
            {editable && (
              <>
                <hr />
                <button role="menuitem" onClick={() => (pop.close(), archive())}>
                  <Archive size={16} aria-hidden="true" /> Archive
                </button>
              </>
            )}
          </MenuItems>
        </Popover>
      )}
      {pop.is('labels') && <LabelsPicker card={card} anchor={pop.anchor} onClose={pop.close} />}
      {pop.is('members') && <MembersPicker card={card} anchor={pop.anchor} onClose={pop.close} />}
      {pop.is('dates') && <DatesPicker card={card} anchor={pop.anchor} onClose={pop.close} />}
      {pop.is('checklist') && <ChecklistPicker card={card} anchor={pop.anchor} onClose={pop.close} />}
      {pop.is('attachment') && <AttachmentPicker card={card} anchor={pop.anchor} onClose={pop.close} upload={upload} />}
      {pop.is('cover') && <CoverPicker card={card} anchor={pop.anchor} onClose={pop.close} images={images} />}
      {pop.is('move') && <MoveCardPicker card={card} anchor={pop.anchor} onClose={pop.close} onMoved={(p) => p && nav(p)} />}
      {pop.is('copy') && (
        <CopyCardPicker card={card} anchor={pop.anchor} onClose={pop.close} counts={{ checklists: card.checklists.length, attachments: card.attachments.length, comments: card.comments.length }} />
      )}
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

function TitleEditor({ card, editable, drafts, lastEditor, reload, autoEdit }: { card: Detail; editable: boolean; autoEdit?: boolean } & DraftRefs) {
  const { ingest } = useBoard();
  const [draft, setDraft] = useState<string | null>(autoEdit && editable ? card.name : null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<null | { theirs: string; by: string }>(null);
  const base = useRef(card.name);
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
        onFocus={(e) => e.currentTarget.select()}
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

  // Someone else saved the description while this user is editing: tell them at once.
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
      <div className="section-head">
        <TextAlignStart size={18} aria-hidden="true" className="section-icon" />
        <h3>Description</h3>
        <OthersEditing cardId={card.id} field="description" />
        <span className="grow" />
        {editable && draft === null && card.description && (
          <button className="btn btn-small btn-light" onClick={start}>
            Edit
          </button>
        )}
      </div>
      <div className="section-body">
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
      </div>
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

function Attachments({ card, editable, act, setConfirm, onAdd }: { card: Detail; editable: boolean; act: Act; setConfirm: (c: any) => void; onAdd: (e: React.MouseEvent<HTMLElement>) => void }) {
  const links = card.attachments.filter((a: any) => a.kind === 'link');
  const files = card.attachments.filter((a: any) => a.kind !== 'link');
  const row = (a: any) => (
    <li key={a.id} className="attachment">
      {a.isImage ? (
        <img src={a.url} alt="" className="att-thumb" loading="lazy" />
      ) : (
        <span className="att-icon">{a.kind === 'link' ? <Link size={20} aria-hidden="true" /> : <Paperclip size={20} aria-hidden="true" />}</span>
      )}
      <div className="grow att-text">
        <a href={a.kind === 'link' ? a.url : `${a.url}?download=1`} target={a.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer nofollow">
          {a.name}
        </a>
        <div className="muted small">
          {a.kind === 'file' ? `${bytes(a.bytes)} · ` : ''}
          {a.uploader?.fullName ?? 'Someone'} · {timeAgo(a.createdAt)}
          {card.cover?.attachmentId === a.id ? ' · Cover' : ''}
        </div>
      </div>
      {editable && a.isImage && (
        <button className="btn btn-small btn-light" onClick={() => act(() => patch(`/cards/${card.id}`, { cover: card.cover?.attachmentId === a.id ? null : { attachmentId: a.id } }))}>
          {card.cover?.attachmentId === a.id ? 'Remove cover' : 'Make cover'}
        </button>
      )}
      {editable && (
        <button
          className="icon-btn"
          aria-label={`Remove ${a.name}`}
          onClick={() => setConfirm({ title: `Remove ${a.name}?`, body: 'The attachment will be permanently removed.', label: 'Remove', run: () => act(() => del(`/attachments/${a.id}`)) })}
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
  return (
    <section className="detail-section">
      <div className="section-head">
        <Paperclip size={18} aria-hidden="true" className="section-icon" />
        <h3>Attachments</h3>
        <span className="grow" />
        {editable && (
          <button className="btn btn-small btn-light" onClick={onAdd}>
            Add
          </button>
        )}
      </div>
      <div className="section-body">
        {links.length > 0 && (
          <>
            <h4 className="subhead">Links</h4>
            <ul className="attachments">{links.map(row)}</ul>
          </>
        )}
        {files.length > 0 && (
          <>
            <h4 className="subhead">Files</h4>
            <ul className="attachments">{files.map(row)}</ul>
          </>
        )}
      </div>
    </section>
  );
}

function Checklist({ cl, card, editable, act, setCard, onDelete }: { cl: any; card: Detail; editable: boolean; act: Act; setCard: (fn: (c: Detail) => Detail) => void; onDelete: () => void }) {
  const [hideChecked, setHideChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editItem, setEditItem] = useState<string | null>(null);
  const [itemPop, setItemPop] = useState<null | { id: string; anchor: HTMLElement }>(null);
  const done = cl.items.filter((i: any) => i.checked).length;
  const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
  const ref = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const shown = cl.items.filter((i: any) => !hideChecked || !i.checked);
  const setItems = (items: any[]) => setCard((c: Detail) => ({ ...c, checklists: c.checklists.map((x: any) => (x.id === cl.id ? { ...x, items } : x)) }));
  const reorder = (from: number, to: number) => {
    const items: any[] = arrayMove(cl.items as any[], from, to);
    const moved = cl.items[from];
    const idx = items.indexOf(moved);
    setItems(items);
    act(() => patch(`/check-items/${moved.id}`, { position: { afterId: idx > 0 ? items[idx - 1].id : null } }));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = cl.items.map((i: any) => i.id);
    reorder(ids.indexOf(e.active.id), ids.indexOf(e.over.id));
  };
  const item = itemPop ? cl.items.find((i: any) => i.id === itemPop.id) : null;
  const itemIdx = item ? cl.items.indexOf(item) : -1;
  return (
    <section className="detail-section" aria-label={`Checklist ${cl.name}`}>
      <div className="section-head">
        <SquareCheck size={18} aria-hidden="true" className="section-icon" />
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
        <span className="grow" />
        {done > 0 && (
          <button className="btn btn-small btn-light" onClick={() => setHideChecked((h) => !h)}>
            {hideChecked ? `Show checked items (${done})` : 'Hide checked items'}
          </button>
        )}
        {editable && (
          <button className="btn btn-small btn-light" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <div className="section-body">
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${cl.name} progress`}>
          <span className="progress-text">{pct}%</span>
          <span className="progress-bar">
            <span style={{ width: `${pct}%` }} className={pct === 100 ? 'complete' : ''} />
          </span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((i: any) => i.id)} strategy={verticalListSortingStrategy} disabled={!editable || editItem !== null}>
            <ul className="check-items">
              {shown.map((i: any) => (
                <CheckItem
                  key={i.id}
                  item={i}
                  editable={editable}
                  editing={editItem === i.id}
                  onEdit={setEditItem}
                  onToggle={(checked) =>
                    act(() => patch(`/check-items/${i.id}`, { checked }), undefined, (c) => ({
                      ...c,
                      checklists: c.checklists.map((x: any) => (x.id === cl.id ? { ...x, items: x.items.map((it: any) => (it.id === i.id ? { ...it, checked } : it)) } : x)),
                    }))
                  }
                  onRename={(name) => act(() => patch(`/check-items/${i.id}`, { name }))}
                  onMenu={(anchor) => setItemPop({ id: i.id, anchor })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {hideChecked && done > 0 && done === cl.items.length && <p className="muted small">Everything in this checklist is done.</p>}
        {editable &&
          (adding ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = ref.current!.value.trim();
                if (!v) return;
                ref.current!.value = '';
                await act(() => post(`/checklists/${cl.id}/items`, { name: v }));
                ref.current?.focus();
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
      </div>
      {itemPop && item && (
        <Popover anchor={itemPop.anchor} title="Item actions" onClose={() => setItemPop(null)}>
          <MenuItems label={`Actions for ${item.name}`}>
            <button
              role="menuitem"
              onClick={async () => {
                setItemPop(null);
                const r: any = await act(() => post(`/check-items/${item.id}/convert`), 'Converted to a card');
                if (r?.card) setItems(cl.items.filter((x: any) => x.id !== item.id));
              }}
            >
              <ArrowRight size={16} aria-hidden="true" /> Convert to card
            </button>
            {itemIdx > 0 && (
              <button role="menuitem" onClick={() => (setItemPop(null), reorder(itemIdx, itemIdx - 1))}>
                Move up
              </button>
            )}
            {itemIdx < cl.items.length - 1 && (
              <button role="menuitem" onClick={() => (setItemPop(null), reorder(itemIdx, itemIdx + 1))}>
                Move down
              </button>
            )}
            <hr />
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                setItemPop(null);
                act(() => del(`/check-items/${item.id}`), undefined, (c) => ({
                  ...c,
                  checklists: c.checklists.map((x: any) => (x.id === cl.id ? { ...x, items: x.items.filter((it: any) => it.id !== item.id) } : x)),
                }));
              }}
            >
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          </MenuItems>
        </Popover>
      )}
    </section>
  );
}

function CheckItem({
  item,
  editable,
  editing,
  onEdit,
  onToggle,
  onRename,
  onMenu,
}: {
  item: any;
  editable: boolean;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onToggle: (checked: boolean) => void;
  onRename: (name: string) => void;
  onMenu: (anchor: HTMLElement) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editable || editing });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <li ref={setNodeRef} style={style} className="check-item">
      <input type="checkbox" checked={item.checked} disabled={!editable} aria-label={item.name} onChange={(e) => onToggle(e.target.checked)} />
      {editing ? (
        <input
          className="grow"
          defaultValue={item.name}
          autoFocus
          aria-label="Item text"
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') (e.stopPropagation(), onEdit(null));
          }}
          onBlur={(e) => {
            onEdit(null);
            const v = e.currentTarget.value.trim();
            if (v && v !== item.name) onRename(v);
          }}
        />
      ) : (
        <button className={`title-btn grow ${item.checked ? 'checked' : ''}`} disabled={!editable} onClick={() => onEdit(item.id)}>
          {item.name}
        </button>
      )}
      {editable && !editing && (
        <span className="check-item-actions">
          <button className="icon-btn drag-handle" {...attributes} {...listeners} aria-label={`Reorder ${item.name}`} aria-roledescription="sortable item">
            <span aria-hidden="true">⋮⋮</span>
          </button>
          <button className="icon-btn" aria-label={`Actions for item ${item.name}`} onClick={(e) => onMenu(e.currentTarget)}>
            <Ellipsis size={16} />
          </button>
        </span>
      )}
    </li>
  );
}

function CommentComposer({ cardId, drafts }: { cardId: string; drafts: React.MutableRefObject<Record<string, string>> }) {
  const { state, ingest } = useBoard();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await post(`/cards/${cardId}/comments`, { body: text });
      ingest(r.event);
      update('');
      setError('');
    } catch (e) {
      // The draft stays in the box so nothing is lost.
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
        <button className="btn btn-primary btn-small" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!text.trim() || busy}>
          Save comment
        </button>
      )}
    </div>
  );
}

function Feed({ card, showDetails, setConfirm }: { card: Detail; showDetails: boolean; setConfirm: (c: any) => void }) {
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
                    if (r) setEditing(null);
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
                        run: () => run(() => del(`/comments/${it.c.id}`)),
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
      {items.length === 0 && (
        <li className="muted small feed-empty">
          <Activity size={16} aria-hidden="true" /> No comments yet.{!showDetails && ' Show details to see the card’s history.'}
        </li>
      )}
    </ul>
  );
}
