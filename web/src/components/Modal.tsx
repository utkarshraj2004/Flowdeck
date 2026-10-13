import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLayer } from './Popover';
import { X } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus moves inside, Tab is trapped, Esc requests close,
 * and focus returns to the opener on close (research E12, J16).
 */
export function Modal({
  title,
  onClose,
  children,
  className = '',
  labelledBy,
  initialFocus,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isTop = useLayer();
  // Captured during the first render, before an autoFocus field inside the dialog takes focus.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  // React keydown (not a native listener) so inner editors can stopPropagation() on Esc first.
  const keyRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // If the focused element disappears (e.g. loading content replaced by the real content), keep focus
  // inside the dialog instead of letting it fall back to <body>, outside the focus trap.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (!document.activeElement || document.activeElement === document.body)) el.focus();
  });

  useEffect(() => {
    const el = ref.current!;
    const first = (initialFocus && el.querySelector<HTMLElement>(initialFocus)) || el.querySelector<HTMLElement>(FOCUSABLE) || el;
    first.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        // Let inner editors handle Esc first (they stop propagation). A keyboard drag in progress
        // (dnd-kit marks its handle aria-pressed) uses Esc to cancel the drag, not to close the dialog.
        if ((e.target as HTMLElement | null)?.closest?.('[aria-pressed="true"]')) return;
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        } else if (!el.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    keyRef.current = onKey;
    document.body.classList.add('modal-open');
    return () => {
      keyRef.current = null;
      document.body.classList.remove('modal-open');
      const target = opener?.dataset?.cardId ? document.querySelector<HTMLElement>(`[data-card-id="${opener.dataset.cardId}"]`) : opener;
      if (target && document.contains(target)) target.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && isTop() && closeRef.current()}>
      <div
        ref={ref}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          keyRef.current?.(e.nativeEvent);
        }}
      >
        {title && !labelledBy && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={() => closeRef.current()}>
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  typedConfirmation,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typedConfirmation?: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal title={title} onClose={onCancel} className="modal-small">
      <form
        className="modal-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          const typed = inputRef.current?.value ?? '';
          if (typedConfirmation !== undefined && typed !== typedConfirmation) return inputRef.current?.focus();
          onConfirm(typed);
        }}
      >
        <div>{body}</div>
        {typedConfirmation !== undefined && (
          <label className="field">
            <span>
              Type <strong>{typedConfirmation}</strong> to confirm
            </span>
            <input ref={inputRef} autoComplete="off" />
          </label>
        )}
        <div className="row end">
          <button type="button" className="btn btn-light" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
