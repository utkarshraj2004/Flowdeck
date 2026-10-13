import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const firstFocusable = (el: HTMLElement) =>
  el.querySelector<HTMLElement>('[data-autofocus]') ??
  el.querySelector<HTMLElement>('.popover-body input:not([type="checkbox"]), .popover-body textarea') ??
  el.querySelector<HTMLElement>(`.popover-body ${FOCUSABLE.split(', ').join(', .popover-body ')}`);

/**
 * Open layers (popovers and dialogs), innermost last. Only the innermost layer reacts to Escape and
 * outside clicks, so closing a confirmation never also closes the popover that opened it.
 */
const layers: object[] = [];
/** True while any popover, dialog, drawer or quick editor is open: page-level shortcuts stay quiet. */
export const hasOpenLayer = () => layers.length > 0;
export function useLayer() {
  const token = useRef({});
  useEffect(() => {
    const t = token.current;
    layers.push(t);
    return () => {
      const i = layers.lastIndexOf(t);
      if (i !== -1) layers.splice(i, 1);
    };
  }, []);
  return () => layers[layers.length - 1] === token.current;
}

export interface PopoverProps {
  /** The control that opened the popover: used for placement and receives focus back on close. */
  anchor: HTMLElement | null;
  title: string;
  onClose: () => void;
  /** Shows a back arrow (for multi-step popovers such as label → create label). */
  onBack?: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}

/**
 * Anchored, non-blocking panel with a title and close button (labels, members, dates, menus…).
 * Focus moves in and returns to the anchor, Tab stays inside, Escape and outside clicks close it.
 * On narrow screens it becomes a bottom sheet with large targets.
 */
export function Popover({ anchor, title, onClose, onBack, children, width = 304, className = '' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isTop = useLayer();
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; sheet: boolean } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 600 || !anchor) return setPos({ top: 0, left: 0, maxHeight: Math.round(vh * 0.85), sheet: true });
      const r = anchor.getBoundingClientRect();
      const h = el.offsetHeight;
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      if (h <= below || below >= above) setPos({ top: r.bottom + 6, left, maxHeight: Math.max(160, below), sheet: false });
      else setPos({ top: Math.max(8, r.top - 6 - Math.min(h, above)), left, maxHeight: above, sheet: false });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, width]);

  // If the focused control inside disappears (a step changes, an item is removed), keep focus in the popover.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (!document.activeElement || document.activeElement === document.body)) (firstFocusable(el) ?? el).focus();
  });

  useEffect(() => {
    const el = ref.current!;
    (firstFocusable(el) ?? el).focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!isTop() || el.contains(t) || anchor?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      // Return focus to the opener when focus was inside (or was lost with the popover).
      const active = document.activeElement;
      if (anchor && document.contains(anchor) && (!active || active === document.body || el.contains(active))) anchor.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className={`popover ${pos?.sheet ? 'popover-sheet' : ''} ${className}`}
      style={pos?.sheet ? { maxHeight: pos.maxHeight } : { top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: pos?.maxHeight }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (e.defaultPrevented) return;
          e.preventDefault();
          e.stopPropagation();
          if (isTop()) closeRef.current();
        } else if (e.key === 'Tab') {
          e.stopPropagation();
          const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
          if (!items.length) return;
          const i = items.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) {
            e.preventDefault();
            items[items.length - 1].focus();
          } else if (!e.shiftKey && i === items.length - 1) {
            e.preventDefault();
            items[0].focus();
          }
        }
      }}
      // Clicks inside must not reach board-level handlers (e.g. a card tile that opens the card).
      onClick={(e) => e.stopPropagation()}
    >
      <div className="popover-head">
        {onBack ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
            <ChevronLeft size={18} />
          </button>
        ) : (
          <span className="popover-head-spacer" />
        )}
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => closeRef.current()}>
          <X size={18} />
        </button>
      </div>
      <div className="popover-body">{children}</div>
    </div>,
    document.body,
  );
}

/** Vertical menu with arrow-key navigation (Up/Down/Home/End); items are `button[role=menuitem]` or `menuitemcheckbox`. */
export function MenuItems({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="menu"
      aria-label={label}
      className="menu-items"
      onKeyDown={(e) => {
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        let next = -1;
        if (e.key === 'ArrowDown') next = (i + 1) % items.length;
        else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        if (next >= 0) {
          e.preventDefault();
          items[next]?.focus();
        }
      }}
    >
      {children}
    </div>
  );
}

/** Open state for a popover plus the element that opened it. */
export function usePopover<K extends string>() {
  const [open, setOpen] = useState<{ kind: K; anchor: HTMLElement } | null>(null);
  return {
    open,
    is: (k: K) => open?.kind === k,
    anchor: open?.anchor ?? null,
    toggle: (k: K) => (e: { currentTarget: HTMLElement }) => setOpen((o) => (o?.kind === k ? null : { kind: k, anchor: e.currentTarget })),
    show: (k: K, anchor: HTMLElement) => setOpen({ kind: k, anchor }),
    close: () => setOpen(null),
  };
}
