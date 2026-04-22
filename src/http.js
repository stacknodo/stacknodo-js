/**
 * Stacknodo SDK — HTTP transport layer
 *
 * Pure fetch wrapper — zero dependencies. Handles auth headers,
 * project/environment resolution, timeouts, and error normalisation.
 */
import { StacknodoError } from './errors.js';

const EXPIRY_SKEW_MS = 30 * 1000;

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof Buffer !== 'undefined'
      ? Buffer.from(normalized, 'base64').toString('utf8')
      : globalThis.atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function inferExpiresAt({ expiresIn, accessToken }) {
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return Date.now() + (expiresIn * 1000);
  }
  const payload = decodeJwtPayload(accessToken);
  return payload?.exp ? payload.exp * 1000 : null;
}

function normaliseSessionPayload(payload = {}) {
  const accessToken = payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token || null;
  const refreshToken = payload?.refreshToken || payload?.data?.refreshToken || null;
  const expiresIn = payload?.expiresIn ?? payload?.data?.expiresIn;
  const session = payload?.session || payload?.data?.session || null;
  return {
    accessToken,
    refreshToken,
    expiresAt: inferExpiresAt({ expiresIn, accessToken }),
    expiresIn: typeof expiresIn === 'number' ? expiresIn : null,
    session,
  };
}

export class HttpClient {
  /**
   * @param {{ baseUrl: string, apiKey: string, projectId: string, environment: string, timeout: number }} opts
   */
  constructor({ baseUrl, apiKey, projectId, environment, timeout }) {
    this.baseUrl     = baseUrl.replace(/\/$/, '');
    this.apiKey      = apiKey;
    this.projectId   = projectId;
    this.environment = environment;
    this.timeout     = timeout;
    this._dbId       = null;          // resolved lazily
    this._sessionToken = null;
    this._platformSession = null;
    this._dataSession = null;
    this._refreshInFlight = {
      platformSession: null,
      dataSession: null,
    };
  }

  /** Prefer a logged-in platform session token over the original API key. */
  setSessionToken(token) {
    this._sessionToken = token || null;
    this._platformSession = token
      ? { accessToken: token, refreshToken: null, expiresAt: inferExpiresAt({ accessToken: token }), expiresIn: null, session: null }
      : null;
  }

  /** Clear any stored platform session token. */
  clearSessionToken() {
    this.clearPlatformSession();
  }

  setPlatformSession(payload) {
    const session = normaliseSessionPayload(payload);
    this._platformSession = session.accessToken ? session : null;
    this._sessionToken = session.accessToken || null;
  }

  clearPlatformSession() {
    this._sessionToken = null;
    this._platformSession = null;
    this._refreshInFlight.platformSession = null;
  }

  getPlatformSession() {
    return this._platformSession;
  }

  setDataSession(payload) {
    const session = normaliseSessionPayload(payload);
    this._dataSession = session.accessToken ? session : null;
  }

  clearDataSession() {
    this._dataSession = null;
    this._refreshInFlight.dataSession = null;
  }

  getDataSession() {
    return this._dataSession;
  }

  /** Return the token used for the next request. */
  getActiveToken(auth = 'apiKey', path = '') {
    if (auth === 'none') return null;
    if (auth === 'session' || auth === 'platformSession') {
      if (!this._platformSession?.accessToken) {
        throw new StacknodoError('No active platform session token', { code: 'NO_SESSION_TOKEN' });
      }
      return this._platformSession.accessToken;
    }
    if (auth === 'dataSession') {
      if (!this._dataSession?.accessToken) {
        throw new StacknodoError('No active data session token', { code: 'NO_DATA_SESSION' });
      }
      return this._dataSession.accessToken;
    }
    if ((auth === 'auto' || auth == null) && path.startsWith('/data/') && this._dataSession?.accessToken) {
      return this._dataSession.accessToken;
    }

    return this.apiKey;
  }

  /** Resolve the databaseId for the current project+environment. */
  async resolveDbId() {
    if (this._dbId) return this._dbId;
    const project = await this.request('GET', `/platform/projects/${this.projectId}`);
    const databases = project?.data?.databases || project?.databases || [];
    const db = databases.find(d => d.environment === this.environment) || databases[0];
    if (!db) throw new StacknodoError('No database found for this project/environment', { code: 'NO_DATABASE' });
    this._dbId = db.id || db._id;
    return this._dbId;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: any, query?: Record<string,any>, headers?: Record<string,string>, stream?: boolean, raw?: boolean, auth?: 'apiKey' | 'session' }} opts
   */
  _resolveAuthMode(path, auth) {
    if (auth === 'session') return 'platformSession';
    if (auth) return auth;
    if (path.startsWith('/data/') && this._dataSession?.accessToken) return 'dataSession';
    return 'apiKey';
  }

  _getSessionState(mode) {
    if (mode === 'platformSession') return this._platformSession;
    if (mode === 'dataSession') return this._dataSession;
    return null;
  }

  _setSessionState(mode, payload) {
    if (mode === 'platformSession') this.setPlatformSession(payload);
    if (mode === 'dataSession') this.setDataSession(payload);
  }

  _clearSessionState(mode) {
    if (mode === 'platformSession') this.clearPlatformSession();
    if (mode === 'dataSession') this.clearDataSession();
  }

  _sessionError(mode) {
    return mode === 'platformSession'
      ? new StacknodoError('No active platform session token', { code: 'NO_SESSION_TOKEN' })
      : new StacknodoError('No active data session token', { code: 'NO_DATA_SESSION' });
  }

  _shouldRefreshSession(session) {
    return !!(session?.refreshToken && session?.expiresAt && session.expiresAt <= (Date.now() + EXPIRY_SKEW_MS));
  }

  _extractDataDbId(path) {
    if (!path || !path.startsWith('/data/')) return null;
    const [, dataRoot, dbId] = path.split('/');
    return dataRoot === 'data' && dbId ? dbId : null;
  }

  async _refreshSession(mode, path = null) {
    if (this._refreshInFlight[mode]) return this._refreshInFlight[mode];

    this._refreshInFlight[mode] = (async () => {
      const session = this._getSessionState(mode);
      if (!session?.refreshToken) throw this._sessionError(mode);

      const dataDbId = mode === 'dataSession'
        ? (this._extractDataDbId(path) || this._dbId || await this.resolveDbId())
        : null;

      const refreshPath = mode === 'platformSession'
        ? '/platform/auth/refresh'
        : `/data/${dataDbId}/auth/refresh`;

      try {
        const payload = await this._performRequest('POST', refreshPath, {
          body: { refreshToken: session.refreshToken },
          authMode: 'none',
        }, null);
        this._setSessionState(mode, payload);
        return this._getSessionState(mode);
      } catch (err) {
        this._clearSessionState(mode);
        throw err;
      } finally {
        this._refreshInFlight[mode] = null;
      }
    })();

    return this._refreshInFlight[mode];
  }

  async _getTokenForRequest(path, authMode) {
    if (authMode === 'none') return null;
    if (authMode === 'apiKey') return this.apiKey;

    const session = this._getSessionState(authMode);
    if (!session?.accessToken) throw this._sessionError(authMode);

    if (this._shouldRefreshSession(session)) {
      await this._refreshSession(authMode, path);
    }

    return this._getSessionState(authMode)?.accessToken || null;
  }

  async _performRequest(method, path, { body, query, headers: extra, stream, raw, authMode } = {}, token = null) {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers = {
      'X-Stacknodo-Project':     this.projectId,
      'X-Stacknodo-Environment': this.environment,
      ...(extra || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = this.timeout > 0
      ? setTimeout(() => controller.abort(), this.timeout)
      : null;

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (stream) return res;

      if (raw) {
        if (!res.ok) {
          throw new StacknodoError(`HTTP ${res.status}`, { status: res.status, code: 'HTTP_ERROR' });
        }
        return res;
      }

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!res.ok) {
        throw new StacknodoError(
          data?.error || data?.message || `HTTP ${res.status}`,
          { status: res.status, code: data?.code || 'HTTP_ERROR', details: data },
        );
      }
      return data;
    } catch (err) {
      if (err instanceof StacknodoError) throw err;
      if (err.name === 'AbortError') {
        throw new StacknodoError('Request timed out', { code: 'TIMEOUT' });
      }
      throw new StacknodoError(err.message, { code: 'NETWORK_ERROR' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async request(method, path, { body, query, headers: extra, stream, raw, auth } = {}) {
    const authMode = this._resolveAuthMode(path, auth);
    let token = await this._getTokenForRequest(path, authMode);

    try {
      return await this._performRequest(method, path, { body, query, headers: extra, stream, raw, authMode }, token);
    } catch (err) {
      const canRetry = (authMode === 'platformSession' || authMode === 'dataSession')
        && err instanceof StacknodoError
        && err.status === 401
        && !!this._getSessionState(authMode)?.refreshToken;

      if (!canRetry) throw err;

      await this._refreshSession(authMode, path);
      token = await this._getTokenForRequest(path, authMode);
      return this._performRequest(method, path, { body, query, headers: extra, stream, raw, authMode }, token);
    }
  }

  async refreshPlatformSession() {
    await this._refreshSession('platformSession');
    return this._platformSession;
  }

  async refreshDataSession() {
    await this._refreshSession('dataSession');
    return this._dataSession;
  }

  get(path, opts)  { return this.request('GET', path, opts); }
  post(path, opts) { return this.request('POST', path, opts); }
  put(path, opts)  { return this.request('PUT', path, opts); }
  del(path, opts)  { return this.request('DELETE', path, opts); }
}
