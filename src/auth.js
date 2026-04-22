/**
 * Stacknodo SDK — Platform and data auth namespaces
 *
 * Usage: client.platformAuth.login({ email, password })
 *
 * This authenticates against Stacknodo platform endpoints such as
 * `/platform/auth/login` and `/platform/auth/me`.
 */
export class PlatformAuthClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http  = http;
    this._user  = null;
  }

  _normaliseAuthResult(result) {
    const accessToken = result?.accessToken || result?.token || result?.data?.accessToken || result?.data?.token || null;
    const refreshToken = result?.refreshToken || result?.data?.refreshToken || null;
    const user = result?.user || result?.data?.user || null;
    return { accessToken, refreshToken, user, raw: result };
  }

  /**
   * Log in with credentials.
   * @param {{ email?: string, username?: string, password: string }} creds
   * @returns {{ token: string, accessToken: string, refreshToken: string|null, user: object }}
   */
  async login(creds) {
    const result = await this._http.post('/platform/auth/login', { body: creds, auth: 'none' });
    const session = this._normaliseAuthResult(result);
    this._user = session.user;
    this._http.setPlatformSession(result);
    return {
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: this._user,
    };
  }

  /** Get the current authenticated user. */
  async getUser() {
    const result = await this._http.get('/platform/auth/me', { auth: 'platformSession' });
    this._user = result?.data || result;
    return this._user;
  }

  /** Refresh the current platform session explicitly. */
  async refresh() {
    const session = await this._http.refreshPlatformSession();
    return {
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      expiresIn: session?.expiresIn || null,
      session: session?.session || null,
    };
  }

  /** Log out (clears local state). */
  async logout() {
    this._user  = null;
    const session = this._http.getPlatformSession();
    if (session?.refreshToken) {
      await this._http.post('/platform/auth/logout', {
        body: { refreshToken: session.refreshToken },
        auth: 'none',
      });
    } else if (session?.accessToken) {
      await this._http.post('/platform/auth/logout', { auth: 'platformSession' });
    }
    this._http.clearPlatformSession();
  }
}

export class DataAuthClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http = http;
    this._user = null;
  }

  async _authPath(suffix) {
    const dbId = await this._http.resolveDbId();
    return `/data/${dbId}/auth/${suffix}`;
  }

  _normaliseAuthResult(result) {
    const accessToken = result?.accessToken || result?.token || result?.data?.accessToken || result?.data?.token || null;
    const refreshToken = result?.refreshToken || result?.data?.refreshToken || null;
    const user = result?.user || result?.data?.user || null;
    return { accessToken, refreshToken, user, raw: result };
  }

  async register(payload) {
    const result = await this._http.post(await this._authPath('register'), {
      body: payload,
      auth: 'none',
    });
    const session = this._normaliseAuthResult(result);
    this._user = session.user;
    this._http.setDataSession(result);
    return {
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: this._user,
    };
  }

  async login(creds) {
    const result = await this._http.post(await this._authPath('login'), {
      body: creds,
      auth: 'none',
    });
    const session = this._normaliseAuthResult(result);
    this._user = session.user;
    this._http.setDataSession(result);
    return {
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: this._user,
    };
  }

  async getUser() {
    const result = await this._http.get(await this._authPath('me'), { auth: 'dataSession' });
    this._user = result?.user || result?.data?.user || result?.data || result;
    return this._user;
  }

  async refresh() {
    const session = await this._http.refreshDataSession();
    return {
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      expiresIn: session?.expiresIn || null,
      session: session?.session || null,
    };
  }

  async logout() {
    const session = this._http.getDataSession();
    if (session?.refreshToken) {
      await this._http.post(await this._authPath('logout'), {
        body: { refreshToken: session.refreshToken },
        auth: 'none',
      });
    } else if (session?.accessToken) {
      await this._http.post(await this._authPath('logout'), { auth: 'dataSession' });
    }
    this._user = null;
    this._http.clearDataSession();
  }
}

// Backward-compatible alias. `client.auth` now points to the explicit
// platform-auth namespace via `client.platformAuth`.
export const AuthClient = PlatformAuthClient;
