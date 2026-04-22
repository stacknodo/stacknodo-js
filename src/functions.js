/**
 * Stacknodo SDK — Functions namespace
 *
 * Usage: client.functions.invoke('my-function', { body: { ... } })
 */
export class FunctionsClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http = http;
  }

  /**
   * Invoke a custom endpoint function.
   * @param {string} functionPath - The function name/path
   * @param {{ body?: any, method?: string }} opts
   */
  async invoke(functionPath, { body, method = 'POST' } = {}) {
    const projectId = this._http.projectId;
    const result = await this._http.request(method, `/run/${projectId}/${functionPath}`, { body });
    return result?.data ?? result;
  }
}
