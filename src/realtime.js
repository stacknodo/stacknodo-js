/**
 * Stacknodo SDK — Real-Time namespace
 *
 * Usage: client.realtime.subscribe('posts', '*', callback)
 */
export class RealtimeClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http           = http;
    this._ws             = null;
    this._subscriptions  = new Map();
    this._nextId         = 1;
    this._reconnectTimer = null;
    this._connected      = false;
  }

  /** Connect to the WebSocket server. */
  async connect() {
    if (this._ws && this._connected) return;

    const wsBase = this._http.baseUrl.replace(/^http/, 'ws');
    const dbId   = await this._http.resolveDbId();
    const url    = `${wsBase}/realtime?dbId=${dbId}&token=${encodeURIComponent(this._http.apiKey)}`;
    const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : (await import('ws')).default;

    return new Promise((resolve, reject) => {
      this._ws = new WebSocketImpl(url);

      this._ws.onopen = () => {
        this._connected = true;
        // Re-subscribe any existing subscriptions after reconnect
        for (const [, sub] of this._subscriptions) {
          this._sendSubscribe(sub.table, sub.event, sub.id);
        }
        resolve();
      };

      this._ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());
          this._dispatch(msg);
        } catch { /* ignore malformed messages */ }
      };

      this._ws.onclose = () => {
        this._connected = false;
        this._scheduleReconnect();
      };

      this._ws.onerror = (err) => {
        if (!this._connected) reject(err);
      };
    });
  }

  /** Subscribe to table events. */
  subscribe(table, event, callback) {
    const id = this._nextId++;
    this._subscriptions.set(id, { table, event, callback, id });
    if (this._connected) {
      this._sendSubscribe(table, event, id);
    } else {
      this.connect().catch(() => {});
    }
    return {
      unsubscribe: () => {
        this._subscriptions.delete(id);
        if (this._connected) {
          this._ws.send(JSON.stringify({ type: 'unsubscribe', id }));
        }
      },
    };
  }

  /** @internal */
  _sendSubscribe(table, event, id) {
    if (this._ws?.readyState === 1) {
      this._ws.send(JSON.stringify({ type: 'subscribe', table, event, id }));
    }
  }

  /** @internal Dispatch incoming events to matching subscriptions. */
  _dispatch(msg) {
    if (msg.type !== 'event') return;
    for (const [, sub] of this._subscriptions) {
      if (sub.table === msg.table && (sub.event === '*' || sub.event === msg.event)) {
        try { sub.callback({ type: msg.event, record: msg.record, table: msg.table }); }
        catch { /* subscriber error doesn't break others */ }
      }
    }
  }

  /** @internal */
  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._subscriptions.size > 0) {
        this.connect().catch(() => {});
      }
    }, 3000);
  }

  /** Disconnect and clean up. */
  disconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._subscriptions.clear();
    if (this._ws) { this._ws.close(); this._ws = null; }
    this._connected = false;
  }
}
