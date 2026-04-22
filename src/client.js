/**
 * Stacknodo SDK — Main Client
 *
 * Pure fetch wrapper — zero production dependencies.
 * Modular namespace structure: sub-clients share HTTP transport, loaded lazily.
 */
import { HttpClient }      from './http.js';
import { QueryBuilder }    from './query-builder.js';
import { StorageClient }   from './storage.js';
import { PlatformAuthClient, DataAuthClient } from './auth.js';
import { AiClient }        from './ai.js';
import { FunctionsClient } from './functions.js';
import { RealtimeClient }  from './realtime.js';
import { AdminClient }     from './admin.js';

const DEFAULT_BASE_URL = 'https://api.stacknodo.com';
const DEFAULT_TIMEOUT  = 30000;

export class Stacknodo {
  /**
   * @param {{
   *   projectId: string,
   *   apiKey: string,
   *   environment?: string,
   *   baseUrl?: string,
   *   timeout?: number,
   *   databaseId?: string,
   * }} opts
   */
  constructor({
    projectId,
    apiKey,
    environment = 'production',
    baseUrl = DEFAULT_BASE_URL,
    timeout = DEFAULT_TIMEOUT,
    databaseId,
  }) {
    if (!projectId) throw new Error('projectId is required');
    if (!apiKey)    throw new Error('apiKey is required');

    this._http = new HttpClient({ baseUrl, apiKey, projectId, environment, timeout });

    // Allow passing databaseId directly to skip lazy resolution
    if (databaseId) this._http._dbId = databaseId;

    // Lazy-initialised sub-clients
    this._storage   = null;
    this._platformAuth = null;
    this._dataAuth  = null;
    this._ai        = null;
    this._functions = null;
    this._realtime  = null;
    this._admin     = null;
  }

  /**
   * Start a query on a table.
   * @param {string} tableName
   * @returns {QueryBuilder}
   */
  from(tableName) {
    return new QueryBuilder(this._http, tableName);
  }

  /** File storage operations. */
  get storage() {
    if (!this._storage) this._storage = new StorageClient(this._http);
    return this._storage;
  }

  /** Platform auth operations. */
  get platformAuth() {
    if (!this._platformAuth) this._platformAuth = new PlatformAuthClient(this._http);
    return this._platformAuth;
  }

  /** Database end-user auth operations. */
  get dataAuth() {
    if (!this._dataAuth) this._dataAuth = new DataAuthClient(this._http);
    return this._dataAuth;
  }

  /** Backward-compatible alias for platform auth operations. */
  get auth() {
    return this.platformAuth;
  }

  /** AI Agent operations. */
  get ai() {
    if (!this._ai) this._ai = new AiClient(this._http);
    return this._ai;
  }

  /** Custom function invocations. */
  get functions() {
    if (!this._functions) this._functions = new FunctionsClient(this._http);
    return this._functions;
  }

  /** Real-time subscriptions. */
  get realtime() {
    if (!this._realtime) this._realtime = new RealtimeClient(this._http);
    return this._realtime;
  }

  /** Admin operations (requires org-admin key). */
  get admin() {
    if (!this._admin) this._admin = new AdminClient(this._http);
    return this._admin;
  }

  /**
   * Create a client from environment variables.
   * Reads STACKNODO_PROJECT_ID, STACKNODO_API_KEY, STACKNODO_ENV, STACKNODO_BASE_URL.
   */
  static fromEnv() {
    return new Stacknodo({
      projectId:   process.env.STACKNODO_PROJECT_ID,
      apiKey:      process.env.STACKNODO_API_KEY,
      environment: process.env.STACKNODO_ENV || 'production',
      baseUrl:     process.env.STACKNODO_BASE_URL || DEFAULT_BASE_URL,
    });
  }
}

/**
 * Create environment-scoped clients from a single config.
 * @param {{ projectId: string, apiKey: string, baseUrl?: string }} opts
 */
export function createEnvironments(opts) {
  return {
    production:  new Stacknodo({ ...opts, environment: 'production' }),
    staging:     new Stacknodo({ ...opts, environment: 'staging' }),
    development: new Stacknodo({ ...opts, environment: 'development' }),
  };
}
