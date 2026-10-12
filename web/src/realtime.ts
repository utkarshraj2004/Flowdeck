export type ConnStatus = 'connecting' | 'online' | 'offline';
type Handler = (msg: any) => void;

interface BoardSub {
  getSeq: () => number;
  onMessage: Handler;
}

/**
 * One WebSocket per browser tab. Board subscriptions are re-sent with their
 * last applied `seq` after every reconnect, so the server replays missed
 * events (research 06 rules 1–3). Reconnects back off 1 s → 30 s with jitter.
 */
class Realtime {
  private ws: WebSocket | null = null;
  private boards = new Map<string, BoardSub>();
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private userListeners = new Set<Handler>();
  private attempt = 0;
  private timer: number | undefined;
  private started = false;
  status: ConnStatus = 'connecting';

  start() {
    if (this.started) return;
    this.started = true;
    this.connect();
    window.addEventListener('online', () => this.reconnectSoon(0));
  }

  stop() {
    this.started = false;
    window.clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  private setStatus(s: ConnStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  private connect() {
    if (!this.started) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/v1/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('online');
      for (const [board, sub] of this.boards) this.sendRaw({ type: 'subscribe', board, sinceSeq: sub.getSeq() });
    };
    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.board && this.boards.has(msg.board)) this.boards.get(msg.board)!.onMessage(msg);
      else for (const l of this.userListeners) l(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('offline');
      if (e.code === 4401) window.dispatchEvent(new CustomEvent('fd:unauthenticated'));
      this.reconnectSoon();
    };
  }

  private reconnectSoon(delay?: number) {
    if (!this.started || this.ws) return;
    window.clearTimeout(this.timer);
    const base = Math.min(30_000, 1000 * 2 ** this.attempt++);
    this.timer = window.setTimeout(() => this.connect(), delay ?? base * (0.75 + Math.random() * 0.5));
  }

  private sendRaw(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(msg: unknown) {
    this.sendRaw(msg);
  }

  subscribeBoard(board: string, getSeq: () => number, onMessage: Handler) {
    this.boards.set(board, { getSeq, onMessage });
    this.sendRaw({ type: 'subscribe', board, sinceSeq: getSeq() });
    return () => {
      if (this.boards.get(board)?.onMessage === onMessage) {
        this.boards.delete(board);
        this.sendRaw({ type: 'unsubscribe', board });
      }
    };
  }

  /** Ask the server to replay from the current seq (used after a detected gap). */
  resubscribe(board: string) {
    const sub = this.boards.get(board);
    if (sub) this.sendRaw({ type: 'subscribe', board, sinceSeq: sub.getSeq() });
  }

  onStatus(l: (s: ConnStatus) => void) {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  onUserMessage(l: Handler) {
    this.userListeners.add(l);
    return () => this.userListeners.delete(l);
  }
}

export const realtime = new Realtime();
