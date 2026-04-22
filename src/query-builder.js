/**
 * Stacknodo SDK — Query Builder
 *
 * Supabase-style chained filter methods with thenable interface.
 * Chains are lazy — no HTTP call until the builder is awaited.
 */
export class QueryBuilder {
  /**
   * @param {import('./http.js').HttpClient} http
   * @param {string} tableName
   */
  constructor(http, tableName) {
    this._http    = http;
    this._table   = tableName;
    this._filters = {};
    this._fields  = null;
    this._sort    = null;
    this._sortDir = null;
    this._limitN  = null;
    this._offsetN = null;
    this._expands = [];
  }

  select(...fields) {
    if (fields.length) this._fields = fields;
    return this;
  }

  eq(field, value)      { this._filters[field] = value; return this; }
  neq(field, value)     { this._filters[field] = { $ne: value }; return this; }
  gt(field, value)      { this._filters[field] = { $gt: value }; return this; }
  gte(field, value)     { this._filters[field] = { $gte: value }; return this; }
  lt(field, value)      { this._filters[field] = { $lt: value }; return this; }
  lte(field, value)     { this._filters[field] = { $lte: value }; return this; }
  in(field, values)     { this._filters[field] = { $in: values }; return this; }
  contains(field, value){ this._filters[field] = { $contains: value }; return this; }

  order(field, dir = 'asc') {
    this._sort = field;
    this._sortDir = dir;
    return this;
  }

  limit(n)  { this._limitN = n; return this; }
  offset(n) { this._offsetN = n; return this; }

  expand(...relations) {
    this._expands.push(...relations);
    return this;
  }

  /** @internal Build query string params for the list endpoint. */
  _buildQuery() {
    const q = {};
    if (Object.keys(this._filters).length) q.filter = JSON.stringify(this._filters);
    if (this._fields)   q.fields  = this._fields.join(',');
    if (this._sort)     q.sort    = this._sort;
    if (this._sortDir)  q.sortDir = this._sortDir;
    if (this._limitN != null)  q.limit  = this._limitN;
    if (this._offsetN != null) q.offset = this._offsetN;
    if (this._expands.length)  q.expand = this._expands.join(',');
    return q;
  }

  /** @internal Resolve the dbId once and cache it. */
  async _dbPath() {
    const dbId = await this._http.resolveDbId();
    return `/data/${dbId}/${this._table}`;
  }

  // ── Thenable — makes `await builder` trigger the list request ────────
  async then(resolve, reject) {
    try {
      const base = await this._dbPath();
      const result = await this._http.get(base, { query: this._buildQuery() });
      resolve(result?.data ?? result);
    } catch (err) {
      if (reject) reject(err); else throw err;
    }
  }

  /** Get a single record by ID. */
  async get(id) {
    const base = await this._dbPath();
    const result = await this._http.get(`${base}/${id}`);
    return result?.data ?? result;
  }

  /** Create a new record. */
  async create(data) {
    const base = await this._dbPath();
    const result = await this._http.post(base, { body: data });
    return result?.data ?? result;
  }

  /** Update a record by ID. */
  async update(id, data) {
    const base = await this._dbPath();
    const result = await this._http.put(`${base}/${id}`, { body: data });
    return result?.data ?? result;
  }

  /** Delete a record by ID. */
  async delete(id) {
    const base = await this._dbPath();
    const result = await this._http.del(`${base}/${id}`);
    return result?.data ?? result;
  }
}
