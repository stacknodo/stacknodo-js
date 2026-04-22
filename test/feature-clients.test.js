import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminClient } from '../src/admin.js';
import { AiClient } from '../src/ai.js';
import { FunctionsClient } from '../src/functions.js';
import { RealtimeClient } from '../src/realtime.js';
import { StorageClient } from '../src/storage.js';
import { createHttpStub, createSseResponse, collectAsyncIterable } from '../test-support/helpers.js';

test('StorageClient uploads files, builds URLs, and downloads buffers', async () => {
  const downloadResponse = {
    async arrayBuffer() {
      return Buffer.from('hello world');
    },
  };

  const http = createHttpStub({
    dbId: 'db_files',
    postImpl: async () => ({ data: { _id: 'file_1' } }),
    getImpl: async (_path, options) => (options?.raw ? downloadResponse : { data: [] }),
    delImpl: async () => ({ deleted: true }),
  });

  const table = new StorageClient(http).from('media');
  const uploadResult = await table.upload(Buffer.from('hello world'), {
    filename: 'greeting.txt',
    contentType: 'text/plain',
  });
  const url = await table.getUrl('file_1');
  const buffer = await table.downloadBuffer('file_1');
  await table.delete('file_1');

  const form = http.calls.post[0].options.body;
  const file = form.get('file');

  assert.deepEqual(uploadResult, { _id: 'file_1' });
  assert.ok(form instanceof FormData);
  assert.ok(file instanceof Blob);
  assert.equal(file.size, 11);
  assert.equal(form.get('contentType'), 'text/plain');
  assert.equal(url, 'https://api.stacknodo.com/files/db_files/media/file_1/url');
  assert.equal(buffer.toString(), 'hello world');
  assert.deepEqual(http.calls.get[0], {
    path: '/data/db_files/media/file_1',
    options: { raw: true },
  });
  assert.deepEqual(http.calls.del[0], {
    path: '/data/db_files/media/file_1',
    options: undefined,
  });
});

test('FunctionsClient invokes project-scoped function routes', async () => {
  const http = createHttpStub({
    projectId: 'proj_fn',
    requestImpl: async (method, path, options) => ({
      data: {
        method,
        path,
        body: options.body,
      },
    }),
  });

  const client = new FunctionsClient(http);
  const result = await client.invoke('sync-orders', {
    method: 'PUT',
    body: { dryRun: true },
  });

  assert.deepEqual(result, {
    method: 'PUT',
    path: '/run/proj_fn/sync-orders',
    body: { dryRun: true },
  });
});

test('AiClient supports standard responses and SSE streaming', async () => {
  const queryStream = createSseResponse([
    'data: {"text":"Hello"}\n',
    'data: {"text":" world"}\n',
    'data: {"text":"","done":true}\n',
  ]);
  const messageStream = createSseResponse([
    'data: {"text":"Reply"}\n',
    'data: {"text":" done","done":true}\n',
  ]);

  const http = createHttpStub({
    projectId: 'proj_ai',
    postImpl: async (path, options) => {
      if (path.endsWith('/query') && options?.stream) return queryStream;
      if (path.endsWith('/query')) return { data: { text: 'Answer', tier: 'balanced' } };
      if (path.endsWith('/conversations')) return { data: { id: 'conv_1' } };
      if (path.endsWith('/message') && options?.stream) return messageStream;
      if (path.endsWith('/message')) return { data: { text: 'Reply once' } };
      throw new Error(`Unexpected AI path: ${path}`);
    },
    getImpl: async () => ({ data: [{ id: 'conv_1' }] }),
    delImpl: async () => ({ data: { deleted: true } }),
  });

  const client = new AiClient(http);
  const answer = await client.query('Summarize my project');
  const streamedAnswer = await collectAsyncIterable(await client.query('Stream it', { stream: true }));
  const conversation = await client.conversations.create({ tier: 'balanced', systemPrompt: 'Be terse' });
  const reply = await client.conversations.send('conv_1', 'Hello');
  const streamedReply = await collectAsyncIterable(await client.conversations.send('conv_1', 'Hello again', { stream: true }));
  const conversations = await client.conversations.list();
  const deleted = await client.conversations.delete('conv_1');

  assert.deepEqual(answer, { text: 'Answer', tier: 'balanced' });
  assert.deepEqual(streamedAnswer, [
    { text: 'Hello' },
    { text: ' world' },
    { text: '', done: true },
  ]);
  assert.deepEqual(conversation, { id: 'conv_1' });
  assert.deepEqual(reply, { text: 'Reply once' });
  assert.deepEqual(streamedReply, [
    { text: 'Reply' },
    { text: ' done', done: true },
  ]);
  assert.deepEqual(conversations, [{ id: 'conv_1' }]);
  assert.deepEqual(deleted, { deleted: true });
  assert.equal(queryStream.wasReleased(), true);
  assert.equal(messageStream.wasReleased(), true);
});

test('AdminClient schema helpers merge and remove fields by table name', async () => {
  const http = createHttpStub({
    dbId: 'db_admin',
    getImpl: async () => ({
      data: [
        {
          id: 'tbl_posts',
          name: 'posts',
          fields: { title: 'string', body: 'string' },
        },
      ],
    }),
    putImpl: async (path, options) => ({ data: { path, fields: options.body.fields } }),
    postImpl: async (path) => ({ data: { path } }),
  });

  const admin = new AdminClient(http);
  const added = await admin.schema.addField('posts', 'published', 'boolean');
  const removed = await admin.schema.deleteField('posts', 'body');
  const promoted = await admin.schema.promote();

  assert.deepEqual(added, {
    path: '/platform/databases/db_admin/tables/tbl_posts',
    fields: { title: 'string', body: 'string', published: 'boolean' },
  });
  assert.deepEqual(removed, {
    path: '/platform/databases/db_admin/tables/tbl_posts',
    fields: { title: 'string' },
  });
  assert.deepEqual(promoted, { path: '/platform/projects/proj_test/promote' });
  await assert.rejects(
    () => admin.schema.addField('comments', 'status', 'string'),
    /Table "comments" not found/,
  );
});

test('RealtimeClient dispatches matching events and unsubscribes cleanly', () => {
  const sent = [];
  const events = [];
  let closed = false;
  const http = {
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    async resolveDbId() {
      return 'db_live';
    },
  };

  const realtime = new RealtimeClient(http);
  realtime._connected = true;
  realtime._ws = {
    readyState: 1,
    send(payload) {
      sent.push(JSON.parse(payload));
    },
    close() {
      closed = true;
    },
  };

  const subscription = realtime.subscribe('posts', '*', (event) => {
    events.push(event);
  });

  realtime._dispatch({
    type: 'event',
    table: 'posts',
    event: 'record.created',
    record: { _id: 'post_1' },
  });
  realtime._dispatch({
    type: 'event',
    table: 'comments',
    event: 'record.created',
    record: { _id: 'comment_1' },
  });

  subscription.unsubscribe();
  realtime.disconnect();

  assert.deepEqual(sent[0], {
    type: 'subscribe',
    table: 'posts',
    event: '*',
    id: 1,
  });
  assert.deepEqual(events, [
    {
      type: 'record.created',
      table: 'posts',
      record: { _id: 'post_1' },
    },
  ]);
  assert.deepEqual(sent[1], { type: 'unsubscribe', id: 1 });
  assert.equal(realtime._subscriptions.size, 0);
  assert.equal(realtime._connected, false);
  assert.equal(closed, true);
});