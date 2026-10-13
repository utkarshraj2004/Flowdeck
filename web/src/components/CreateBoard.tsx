import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api';
import { Modal } from './Modal';
import { BACKGROUNDS } from './ui';

export function CreateBoardDialog({ workspaces, workspaceId, onClose }: { workspaces: { id: string; name: string; settings?: any }[]; workspaceId?: string; onClose: () => void }) {
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [bg, setBg] = useState<string>('ocean');
  const [name, setName] = useState('');
  const defaultWs = workspaceId ?? workspaces[0]?.id;
  const defaultVis = workspaces.find((w) => w.id === defaultWs)?.settings?.defaultBoardVisibility ?? 'workspace';
  return (
    <Modal title="Create board" onClose={onClose} className="modal-small">
      <form
        className="modal-body stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await post('/boards', {
              name,
              workspaceId: f.get('workspaceId'),
              visibility: f.get('visibility'),
              background: bg,
              defaultLists: f.get('defaultLists') === 'on',
            });
            onClose();
            nav(`/b/${r.board.shortId}`);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className={`board-preview bg-${bg}`} aria-hidden="true" />
        <fieldset className="swatches">
          <legend>Background</legend>
          {BACKGROUNDS.map((b) => (
            <label key={b} className={`swatch bg-${b} ${bg === b ? 'selected' : ''}`}>
              <input type="radio" name="bg" value={b} checked={bg === b} onChange={() => setBg(b)} className="visually-hidden" />
              <span className="visually-hidden">{b}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Board title</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoFocus aria-describedby="board-title-hint" />
          {!name.trim() && (
            <small id="board-title-hint" className="muted">
              A board title is required.
            </small>
          )}
        </label>
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
        <label className="row">
          <input type="checkbox" name="defaultLists" defaultChecked /> Start with “To do”, “Doing” and “Done” lists
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
    </Modal>
  );
}
