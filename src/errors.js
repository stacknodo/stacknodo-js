/**
 * Stacknodo SDK — Error class
 */
export class StacknodoError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, details?: any }} opts
   */
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'StacknodoError';
    this.status = status || 0;
    this.code = code || 'UNKNOWN';
    this.details = details || null;
  }
}
