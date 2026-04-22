/**
 * Stacknodo SDK — Storage namespace
 *
 * File-level operations scoped to a file storage table.
 * Usage: client.storage.from('media').upload(file)
 */
export class StorageClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http = http;
  }

  /** Scope operations to a file storage table. */
  from(tableName) {
    return new StorageTable(this._http, tableName);
  }
}

class StorageTable {
  constructor(http, tableName) {
    this._http  = http;
    this._table = tableName;
  }

  async _dbPath() {
    const dbId = await this._http.resolveDbId();
    return `/data/${dbId}/${this._table}`;
  }

  /**
   * Upload a file.
   * @param {Blob|Buffer|ReadableStream} file - The file data
   * @param {{ filename?: string, contentType?: string }} opts
   */
  async upload(file, { filename, contentType } = {}) {
    const base = await this._dbPath();
    const form = new FormData();
    const blob = file instanceof Blob ? file : new Blob([file]);
    form.append('file', blob, filename || 'upload');
    if (contentType) form.append('contentType', contentType);
    const result = await this._http.post(base, { body: form });
    return result?.data ?? result;
  }

  /** Get a download URL for a file record. */
  async getUrl(fileId) {
    const dbId = await this._http.resolveDbId();
    return `${this._http.baseUrl}/files/${dbId}/${this._table}/${fileId}/url`;
  }

  /** Download a file as a Response (streaming). */
  async download(fileId) {
    const base = await this._dbPath();
    return this._http.get(`${base}/${fileId}`, { raw: true });
  }

  /** Download a file as a Buffer (Node.js). */
  async downloadBuffer(fileId) {
    const res = await this.download(fileId);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /** Delete a file. */
  async delete(fileId) {
    const base = await this._dbPath();
    return this._http.del(`${base}/${fileId}`);
  }
}
