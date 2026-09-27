// Tiny WebSocket client with auto-reconnect. Same for phones and the instructor page.
import type { ClientMessage, ServerMessage } from '@scoring-test/shared';

export type Listener = (msg: ServerMessage) => void;

export class Socket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stopped = false;
  private retry = 0;
  connected = false;
  onStatus: (connected: boolean) => void = () => {};

  constructor(private hello: () => ClientMessage) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onStatus(true);
      ws.send(JSON.stringify(this.hello()));
    };
    ws.onmessage = ev => {
      let msg: ServerMessage;
      try { msg = JSON.parse(ev.data); } catch { return; }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus(false);
      if (this.stopped) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
}
