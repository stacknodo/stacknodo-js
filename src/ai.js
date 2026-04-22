/**
 * Stacknodo SDK — AI Agent namespace
 *
 * Usage:
 *   const answer = await client.ai.query('question', { tier: 'balanced' });
 *   const stream = await client.ai.query('question', { stream: true });
 */
export class AiClient {
  /** @param {import('./http.js').HttpClient} http */
  constructor(http) {
    this._http = http;
  }

  /**
   * Send a query to the AI Agent.
   * @param {string} question
   * @param {{ tier?: string, context?: Array, files?: string[], fileTable?: string, stream?: boolean }} opts
   * @returns {Promise<{ text: string, tier: string, usage: object }> | AsyncIterable<{ text: string, done?: boolean }>}
   */
  async query(question, { tier, context, files, fileTable, stream } = {}) {
    const projectId = this._http.projectId;
    const body = { question, tier, context, files, fileTable, stream: !!stream };

    if (stream) {
      const res = await this._http.post(
        `/platform/ai-agent/${projectId}/query`,
        { body, stream: true },
      );
      return this._iterateSSE(res);
    }

    const result = await this._http.post(`/platform/ai-agent/${projectId}/query`, { body });
    return result?.data ?? result;
  }

  /** Iterate SSE events from a streaming response. */
  async *_iterateSSE(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.slice(6));
            } catch { /* skip malformed events */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Create a stateful conversation. */
  get conversations() {
    return new ConversationsClient(this._http);
  }
}

class ConversationsClient {
  constructor(http) {
    this._http = http;
  }

  /** Create a new conversation. */
  async create({ tier, systemPrompt, files, fileTable } = {}) {
    const projectId = this._http.projectId;
    const result = await this._http.post(
      `/platform/ai-agent/${projectId}/conversations`,
      { body: { tier, systemPrompt, files, fileTable } },
    );
    return result?.data ?? result;
  }

  /** Send a message to an existing conversation. */
  async send(conversationId, message, { stream, files, fileTable } = {}) {
    const projectId = this._http.projectId;
    const body = { message, stream: !!stream, files, fileTable };
    const result = await this._http.post(
      `/platform/ai-agent/${projectId}/conversations/${conversationId}/message`,
      { body, stream: !!stream },
    );
    if (stream) {
      return new AiClient(this._http)._iterateSSE(result);
    }
    return result?.data ?? result;
  }

  /** List conversations. */
  async list() {
    const projectId = this._http.projectId;
    const result = await this._http.get(`/platform/ai-agent/${projectId}/conversations`);
    return result?.data ?? result;
  }

  /** Delete a conversation. */
  async delete(conversationId) {
    const projectId = this._http.projectId;
    const result = await this._http.del(`/platform/ai-agent/${projectId}/conversations/${conversationId}`);
    return result?.data ?? result;
  }
}
