/**
 * Stacknodo SDK — Admin namespace
 *
 * Requires org-admin API key (snk_org_...).
 * Usage: client.admin.schema.listTables()
 */
import { StacknodoError } from './errors.js';

class SchemaAdmin {
  constructor(http) { this._http = http; }

  async listTables() {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.get(`/platform/databases/${dbId}/tables`);
    return result?.data ?? result;
  }

  async createTable(name, { fields, rls } = {}) {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/tables`, {
      body: { name, fields, rls },
    });
    return result?.data ?? result;
  }

  async addField(tableName, fieldName, fieldType) {
    const dbId = await this._http.resolveDbId();
    const tables = await this.listTables();
    const table = tables.find(t => t.name === tableName);
    if (!table) throw new Error(`Table "${tableName}" not found`);
    const fields = { ...(table.fields || {}), [fieldName]: fieldType };
    const result = await this._http.put(`/platform/databases/${dbId}/tables/${table._id || table.id}`, {
      body: { fields },
    });
    return result?.data ?? result;
  }

  async deleteTable(tableId) {
    const dbId = await this._http.resolveDbId();
    return this._http.del(`/platform/databases/${dbId}/tables/${tableId}`);
  }

  async deleteField(tableName, fieldName) {
    const dbId = await this._http.resolveDbId();
    const tables = await this.listTables();
    const table = tables.find(t => t.name === tableName);
    if (!table) throw new Error(`Table "${tableName}" not found`);
    const fields = { ...(table.fields || {}) };
    delete fields[fieldName];
    const result = await this._http.put(`/platform/databases/${dbId}/tables/${table._id || table.id}`, {
      body: { fields },
    });
    return result?.data ?? result;
  }

  async promote() {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/promote`);
    return result?.data ?? result;
  }

  /**
   * Export the portable, secret-free database schema (tables, fields, relations,
   * allowedIPs). Contains no row data and no secrets such as jwtSecret or
   * superuserToken.
   *
   * For security, the SDK only exposes schema export. Full data backups
   * (the `/export` zip bundle and snapshot downloads) are intentionally NOT
   * downloadable through the SDK — use the Stacknodo dashboard for those.
   */
  async export() {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.get(`/platform/databases/${dbId}/schema`);
    return result?.data ?? result;
  }

  /**
   * Import a full schema config (tables, fields, rls, relations, authentication)
   * into the current database. This is the endpoint that actually CREATES tables
   * from a schema JSON — `PUT /config` only updates database-level metadata and
   * does not create tables.
   *
   * @param {object} config  Schema config, e.g. `{ tables: { posts: { fields, rls } } }`.
   * @param {{ mode?: 'merge' | 'replace' }} [opts]  `merge` (default) upserts tables;
   *   `replace` wipes every existing table first. The backend auto-snapshots before
   *   importing. The response may include a non-blocking `warnings` array
   *   (e.g. `unknown_field_type`, `missing_rls`).
   * @returns {Promise<{ success: boolean, message: string, created: number, updated: number, warnings?: object[] }>}
   */
  async import(config, { mode = 'merge' } = {}) {
    if (!config || typeof config !== 'object' || !config.tables) {
      throw new StacknodoError('schema.import requires a config object with a `tables` map', { code: 'INVALID_ARG' });
    }
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/import`, { body: { config, mode } });
    return result?.data ?? result;
  }
}

class SnapshotsAdmin {
  constructor(http) { this._http = http; }

  async create({ name } = {}) {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/snapshots`, { body: { note: name } });
    return result?.data ?? result;
  }

  async list() {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.get(`/platform/databases/${dbId}/snapshots`);
    return result?.data ?? result;
  }

  async restore(snapshotId) {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/snapshots/${snapshotId}/restore`);
    return result?.data ?? result;
  }
  // For security, snapshots can be created, listed, and restored, but NOT
  // downloaded or deleted via the SDK. Downloading a snapshot would expose a
  // full data backup, so it is intentionally omitted — use the dashboard.
}

class ProjectsAdmin {
  constructor(http) { this._http = http; }

  // Projects are organisation-scoped: /platform/orgs/:orgId/projects. The orgId is
  // resolved automatically from the credential (GET /platform/orgs/current) unless
  // passed explicitly.
  async list(orgId) {
    const org = orgId || await this._http.resolveOrgId();
    const result = await this._http.get(`/platform/orgs/${org}/projects`);
    return result?.data ?? result;
  }

  async create({ name, orgId } = {}) {
    if (!name) throw new StacknodoError('projects.create requires a name', { code: 'INVALID_ARG' });
    const org = orgId || await this._http.resolveOrgId();
    const result = await this._http.post(`/platform/orgs/${org}/projects`, { body: { name } });
    return result?.data ?? result;
  }

  async update(projectId, { name, orgId } = {}) {
    if (!projectId) throw new StacknodoError('projects.update requires a projectId', { code: 'INVALID_ARG' });
    const org = orgId || await this._http.resolveOrgId();
    const result = await this._http.put(`/platform/orgs/${org}/projects/${projectId}`, { body: { name } });
    return result?.data ?? result;
  }
  // No delete — intentionally omitted. Deleting a project cascades to every
  // database and table it owns; that destructive operation is dashboard-only.
}

class EnvironmentsAdmin {
  constructor(http) { this._http = http; }

  async list() {
    const projectId = this._http.projectId;
    const result = await this._http.get(`/platform/projects/${projectId}/databases`);
    const databases = result?.data ?? result ?? [];
    return databases.map(db => db.environment);
  }

  async add(environment) {
    const dbId = await this._http.resolveDbId();
    const result = await this._http.post(`/platform/databases/${dbId}/add-environment`, {
      body: { environment },
    });
    return result?.data ?? result;
  }
}

class OrgAdmin {
  constructor(http) { this._http = http; }

  /**
   * Resolve the organisation bound to the current credential.
   * @returns {Promise<{ id: string, name: string, slug: string, role: string, projectId?: string }>}
   */
  async get() {
    const result = await this._http.get('/platform/orgs/current');
    const org = result?.data ?? result;
    const id = org?.id || org?._id;
    if (id) this._http._orgId = id; // warm the shared cache
    return org;
  }

  async usage() {
    const result = await this._http.get('/platform/billing/usage');
    return result?.data ?? result;
  }
}

class ApiKeysAdmin {
  constructor(http) { this._http = http; }

  /**
   * List the API keys in an organisation. Raw key material is never returned —
   * only metadata (id, name, scope, prefix, allowedEnvironments, …).
   * @param {string} [orgId]  Defaults to the credential's bound org.
   */
  async list(orgId) {
    const org = orgId || await this._http.resolveOrgId();
    const result = await this._http.get(`/platform/orgs/${org}/api-keys`);
    return result?.data ?? result;
  }

  /**
   * Create a project-scoped API key (snk_proj_…). The raw key is returned **once**
   * — persist it to a secret manager immediately; it cannot be retrieved later.
   *
   * @param {string} projectId
   * @param {{ name: string, environments?: string[] | null }} opts
   *   `environments` restricts the key to specific environments
   *   (`production` | `staging` | `development`). Omit or pass `null` to allow all
   *   environments — narrowing to the minimum needed is recommended.
   * @returns {Promise<{ id, name, rawKey, prefix, scope, allowedEnvironments, createdAt }>}
   */
  async createProjectKey(projectId, { name, environments } = {}) {
    if (!projectId) throw new StacknodoError('createProjectKey requires a projectId', { code: 'INVALID_ARG' });
    if (!name) throw new StacknodoError('createProjectKey requires a key name', { code: 'INVALID_ARG' });
    const body = { name };
    if (environments !== undefined) body.allowedEnvironments = environments; // null = all environments
    const result = await this._http.post(`/platform/projects/${projectId}/api-keys`, { body });
    return result?.data ?? result;
  }

  /**
   * Update a project key's name and/or environment restriction.
   * @param {string} keyId
   * @param {{ name?: string, environments?: string[] | null }} updates
   */
  async update(keyId, { name, environments } = {}) {
    if (!keyId) throw new StacknodoError('apiKeys.update requires a keyId', { code: 'INVALID_ARG' });
    const body = {};
    if (name !== undefined) body.name = name;
    if (environments !== undefined) body.allowedEnvironments = environments;
    const result = await this._http.put(`/platform/api-keys/${keyId}`, { body });
    return result?.data ?? result;
  }

  /** Revoke (permanently disable) an API key. */
  async revoke(keyId) {
    if (!keyId) throw new StacknodoError('apiKeys.revoke requires a keyId', { code: 'INVALID_ARG' });
    return this._http.del(`/platform/api-keys/${keyId}`);
  }
}

export class AdminClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http = http;
  }

  get schema()       { return new SchemaAdmin(this._http); }
  get snapshots()    { return new SnapshotsAdmin(this._http); }
  get projects()     { return new ProjectsAdmin(this._http); }
  get environments() { return new EnvironmentsAdmin(this._http); }
  get org()          { return new OrgAdmin(this._http); }
  get apiKeys()      { return new ApiKeysAdmin(this._http); }

  /**
   * One-call project bootstrap for org-key holders: create a project, mint a
   * project-scoped API key for it, and return a ready project-scoped client.
   *
   * This is the recommended way to move off an organisation key: the org key is
   * used only for this management call, and the returned `client` is authenticated
   * with the new project key — the app never holds the org key at runtime.
   *
   * The raw project key is sensitive and visible only once. Either pass a
   * `persist` callback (it receives the raw key and the key is then NOT returned),
   * or read `rawKey` from the result and store it in a secret manager immediately.
   * The raw key is never logged by the SDK.
   *
   * @param {{
   *   name: string,
   *   environments?: string[] | null,
   *   keyName?: string,
   *   environment?: string,
   *   persist?: (rawKey: string) => void | Promise<void>,
   * }} opts
   * @returns {Promise<{ project: object, apiKey: object, client: import('./client.js').Stacknodo, rawKey?: string }>}
   */
  async bootstrapProject({ name, environments = null, keyName, environment, persist } = {}) {
    if (!name) throw new StacknodoError('bootstrapProject requires a project name', { code: 'INVALID_ARG' });

    const orgId = await this._http.resolveOrgId();

    // 1. Create the project.
    const projectRes = await this._http.post(`/platform/orgs/${orgId}/projects`, { body: { name } });
    const project = projectRes?.data ?? projectRes;
    const projectId = project?._id || project?.id;
    if (!projectId) {
      throw new StacknodoError('Project creation did not return an id', { code: 'BOOTSTRAP_FAILED', details: project });
    }

    // 2. Mint a project-scoped key (optionally environment-restricted).
    const key = await this.apiKeys.createProjectKey(projectId, { name: keyName || `${name} key`, environments });
    const rawKey = key?.rawKey;
    if (!rawKey) {
      throw new StacknodoError('Project key creation did not return a key', { code: 'BOOTSTRAP_FAILED', details: key });
    }

    // 3. Build a ready project-scoped client from the new key. Dynamic import keeps
    //    admin.js free of a static cycle with client.js.
    const { Stacknodo } = await import('./client.js');
    const targetEnv = environment
      || (Array.isArray(environments) && environments.length ? environments[0] : 'production');
    const client = new Stacknodo({
      projectId,
      apiKey: rawKey,
      environment: targetEnv,
      baseUrl: this._http.baseUrl,
      timeout: this._http.timeout,
    });

    // 4. Metadata only — never echo the raw key into the returned key object.
    const apiKey = {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scope: key.scope,
      allowedEnvironments: key.allowedEnvironments ?? null,
      createdAt: key.createdAt,
    };

    // 5. Hand off the raw key: persist-and-forget, or return it once.
    if (typeof persist === 'function') {
      await persist(rawKey);
      return { project, apiKey, client };
    }
    return { project, apiKey, client, rawKey };
  }
}
