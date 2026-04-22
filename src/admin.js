/**
 * Stacknodo SDK — Admin namespace
 *
 * Requires org-admin API key (snk_org_...).
 * Usage: client.admin.schema.listTables()
 */

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
    const projectId = this._http.projectId;
    const result = await this._http.post(`/platform/projects/${projectId}/promote`);
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

  async delete(snapshotId) {
    const dbId = await this._http.resolveDbId();
    return this._http.del(`/platform/databases/${dbId}/snapshots/${snapshotId}`);
  }
}

class ProjectsAdmin {
  constructor(http) { this._http = http; }

  async list() {
    const result = await this._http.get('/platform/projects');
    return result?.data ?? result;
  }

  async create({ name }) {
    const result = await this._http.post('/platform/projects', { body: { name } });
    return result?.data ?? result;
  }

  async update(projectId, data) {
    const result = await this._http.put(`/platform/projects/${projectId}`, { body: data });
    return result?.data ?? result;
  }
  // No delete — intentionally omitted (Studio UI only, too dangerous for SDK)
}

class EnvironmentsAdmin {
  constructor(http) { this._http = http; }

  async list() {
    const projectId = this._http.projectId;
    const result = await this._http.get(`/platform/projects/${projectId}/environments`);
    return result?.data ?? result;
  }

  async add(environment) {
    const projectId = this._http.projectId;
    const result = await this._http.post(`/platform/projects/${projectId}/environments`, {
      body: { environment },
    });
    return result?.data ?? result;
  }
}

class OrgAdmin {
  constructor(http) { this._http = http; }

  async get() {
    const result = await this._http.get('/platform/orgs/current');
    return result?.data ?? result;
  }

  async usage() {
    const result = await this._http.get('/platform/billing/usage');
    return result?.data ?? result;
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
}
