import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { Modal } from './Modal';
import { BACKGROUNDS } from './ui';

export interface BoardTemplate {
  id: string;
  name: string;
  background: string;
  workspaceId: string;
}

interface CreateBoardDialogProps {
  workspaces: { id: string; name: string; settings?: any }[];
  workspaceId?: string;
  /** Template boards to offer; fetched from /me/home when not given. */
  templates?: BoardTemplate[];
  /** Preselects a template (e.g. "Use template" on the home page). */
  templateId?: string;
  onClose: () => void;
}

const BACKGROUND_NAMES: Record<string, string> = {
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  berry: 'Berry',
  slate: 'Slate',
  sand: 'Sand',
  teal: 'Teal',
  plum: 'Plum',
};

export function CreateBoardDialog({ workspaces, workspaceId, templates: givenTemplates, templateId: initialTemplateId = '', onClose }: CreateBoardDialogProps) {
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetchedTemplates, setFetchedTemplates] = useState<BoardTemplate[]>([]);
  const templates = givenTemplates ?? fetchedTemplates;
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [bg, setBg] = useState<string>(() => givenTemplates?.find((t) => t.id === initialTemplateId)?.background ?? 'ocean');
  const [name, setName] = useState('');
  const defaultWs = workspaceId ?? workspaces[0]?.id;
  const defaultVis = workspaces.find((w) => w.id === defaultWs)?.settings?.defaultBoardVisibility ?? 'workspace';
  const template = templates.find((t) => t.id === templateId);

  useEffect(() => {
    if (givenTemplates) return;
    let cancelled = false;
    get('/me/home')
      .then((r) => !cancelled && setFetchedTemplates(r.boards.filter((b: any) => b.isTemplate && !b.closedAt)))
      .catch(() => undefined); // Templates are optional: a blank board still works.
    return () => {
      cancelled = true;
    };
  }, [givenTemplates]);

  return (
    <Modal title="Create board" onClose={onClose} className="modal-small" initialFocus="#create-board-title">
      <form
        className="modal-body stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const r = await post('/boards', {
              name: name.trim(),
              workspaceId: f.get('workspaceId'),
              visibility: f.get('visibility'),
              background: bg,
              ...(template ? { sourceBoardId: template.id, keepCards: true, defaultLists: false } : { defaultLists: f.get('defaultLists') === 'on' }),
            });
            onClose();
            nav(`/b/${r.board.shortId}`);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className={`board-preview cb-preview bg-${bg}`} aria-hidden="true">
          <span className="cb-preview-title">{name.trim() || 'Board title'}</span>
          <span className="cb-preview-lists">
            <span />
            <span />
            <span />
          </span>
        </div>
        <fieldset className="swatches">
          <legend>
            Background <span className="muted cb-bg-name">· {BACKGROUND_NAMES[bg] ?? bg}</span>
          </legend>
          {BACKGROUNDS.map((b) => (
            <label key={b} className={`swatch bg-${b} ${bg === b ? 'selected' : ''}`} title={BACKGROUND_NAMES[b]}>
              <input type="radio" name="bg" value={b} checked={bg === b} onChange={() => setBg(b)} className="visually-hidden" />
              <span className="visually-hidden">{BACKGROUND_NAMES[b] ?? b}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Board title</span>
          <input id="create-board-title" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required aria-describedby="board-title-hint" />
          {!name.trim() && (
            <small id="board-title-hint" className="muted">
              A board title is required.
            </small>
          )}
        </label>
        {templates.length > 0 && (
          <label className="field">
            <span>Start from a template</span>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const t = templates.find((x) => x.id === e.target.value);
                if (t) setBg(t.background);
              }}
              aria-describedby="board-template-hint"
            >
              <option value="">Blank board</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <small id="board-template-hint" className="muted">
              {template ? 'Copies the template’s lists, labels and cards into the new board.' : 'Or choose a template to copy its lists, labels and cards.'}
            </small>
          </label>
        )}
        <label className="field">
          <span>Workspace</span>
          <select name="workspaceId" defaultValue={defaultWs}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Visibility</span>
          <select name="visibility" defaultValue={defaultVis}>
            <option value="workspace">Workspace — every workspace member can see it</option>
            <option value="private">Private — only board members can see it</option>
          </select>
        </label>
        {!template && (
          <label className="row">
            <input type="checkbox" name="defaultLists" defaultChecked /> Start with “To do”, “Doing” and “Done” lists
          </label>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" disabled={!name.trim() || busy}>
          Create
        </button>
      </form>
    </Modal>
  );
}
