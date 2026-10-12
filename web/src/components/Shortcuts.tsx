import { Modal } from './Modal';

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const SHORTCUTS: [string, string][] = [
  ['/', 'Focus search'],
  ['b', 'Switch board'],
  ['?', 'Show this help'],
  ['f', 'Open the board filter'],
  ['x', 'Clear all filters'],
  ['q', 'Show only cards assigned to me'],
  ['n', 'Add a card to the focused list'],
  ['↑ ↓ ← →  or  j k', 'Move focus between cards and lists'],
  ['Enter', 'Open the focused card'],
  ['Space', 'Pick up the focused card; arrows move it; Enter or Space drops; Esc cancels'],
  [', .', 'Move the focused card to the bottom of the previous / next list'],
  ['< >', 'Move the focused card to the top of the previous / next list'],
  ['e', 'Quick edit the focused or hovered card'],
  ['l  m  d', 'Labels, members or dates of the focused or hovered card'],
  ['t', 'Open the card and edit its title'],
  ['-', 'Open the card and add a checklist'],
  ['s', 'Watch or stop watching the card'],
  ['c', 'Archive the focused or hovered card'],
  ['z', 'Undo the last archive'],
  [';', 'Show or hide label names on cards'],
  ['Ctrl/⌘ + Enter', 'Save the text you are editing'],
  ['Esc', 'Cancel editing or close a dialog'],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} className="modal-small">
      <div className="modal-body">
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Shortcuts can be turned off in Account settings.</p>
      </div>
    </Modal>
  );
}
