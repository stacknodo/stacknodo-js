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
  assert.deepEqual(promoted, { path: '/platform/databases/db_admin/promote' });
  await assert.rejects(
    () => admin.schema.addField('comments', 'status', 'string'),
    /Table "comments" not found/,
  );
});

test('AdminClient exposes schema export but not data backup downloads', async () => {
  const http = createHttpStub({
    dbId: 'db_admin',
    getImpl: async (path) => ({ data: { path, tables: [], relations: [] } }),
  });

  const admin = new AdminClient(http);
  const schema = await admin.schema.export();

  assert.deepEqual(schema, {
    path: '/platform/databases/db_admin/schema',
    tables: [],
    relations: [],
  });

  // For security, full data backups must not be reachable through the SDK.
  assert.equal(typeof admin.snapshots.download, 'undefined');
  assert.equal(typeof admin.snapshots.delete, 'undefined');
  assert.equal(typeof admin.schema.exportData, 'undefined');
});

test('AdminClient projects use org-scoped routes with auto org resolution', async () => {
  const http = createHttpStub({
    orgId: 'org_42',
    getImpl: async (path) => ({ data: { path } }),
    postImpl: async (path, options) => ({ data: { path, body: options.body } }),
    putImpl: async (path, options) => ({ path, body: options.body }),
  });

  const admin = new AdminClient(http);
  const listed = await admin.projects.list();
  const created = await admin.projects.create({ name: 'Stamplyse' });
  const updated = await admin.projects.update('proj_9', { name: 'Renamed' });

  assert.deepEqual(listed, { path: '/platform/orgs/org_42/projects' });
  assert.deepEqual(created, { path: '/platform/orgs/org_42/projects', body: { name: 'Stamplyse' } });
  assert.deepEqual(updated, { path: '/platform/orgs/org_42/projects/proj_9', body: { name: 'Renamed' } });
  assert.equal(http.calls.resolveOrgId, 3);
  // An explicit orgId overrides resolution.
  await admin.projects.list('org_explicit');
  assert.equal(http.calls.get.at(-1).path, '/platform/orgs/org_explicit/projects');
  assert.equal(http.calls.resolveOrgId, 3);
});

test('AdminClient org.get resolves current org and warms the id cache', async () => {
  const http = createHttpStub({
    getImpl: async (path) => ({ data: { id: 'org_live', name: 'Acme', slug: 'acme', role: 'owner', path } }),
  });
  const admin = new AdminClient(http);
  const org = await admin.org.get();

  assert.equal(http.calls.get.at(-1).path, '/platform/orgs/current');
  assert.equal(org.id, 'org_live');
  assert.equal(org.role, 'owner');
  assert.equal(http._orgId, 'org_live'); // cache warmed for subsequent project calls
});

test('AdminClient schema.import posts a full config to the import endpoint', async () => {
  const http = createHttpStub({
    dbId: 'db_admin',
    postImpl: async (path, options) => ({
      success: true,
      message: 'Import complete: 1 created, 0 updated',
      created: 1,
      updated: 0,
      _path: path,
      _body: options.body,
      warnings: [{ code: 'missing_rls', message: 'no rls' }],
    }),
  });

  const admin = new AdminClient(http);
  const config = { tables: { posts: { fields: { title: 'string' } } } };
  const result = await admin.schema.import(config, { mode: 'replace' });

  assert.equal(result._path, '/platform/databases/db_admin/import');
  assert.deepEqual(result._body, { config, mode: 'replace' });
  assert.equal(result.created, 1);
  assert.deepEqual(result.warnings, [{ code: 'missing_rls', message: 'no rls' }]);
  await assert.rejects(() => admin.schema.import({}), /requires a config object with a `tables` map/);
});

test('AdminClient apiKeys manage project keys via the key lifecycle routes', async () => {
  const http = createHttpStub({
    orgId: 'org_42',
    getImpl: async (path) => ({ data: [{ id: 'key_1', scope: 'project', prefix: 'ab12', path }] }),
    postImpl: async (path, options) => ({
      data: { id: 'key_new', name: options.body.name, rawKey: 'snk_proj_secret', prefix: 'cd34', scope: 'project', allowedEnvironments: options.body.allowedEnvironments ?? null, _path: path },
    }),
    putImpl: async (path, options) => ({ data: { _path: path, _body: options.body } }),
    delImpl: async (path) => ({ success: true, _path: path }),
  });

  const admin = new AdminClient(http);
  const listed = await admin.apiKeys.list();
  const created = await admin.apiKeys.createProjectKey('proj_9', { name: 'web', environments: ['production'] });
  const updated = await admin.apiKeys.update('key_new', { name: 'web-prod', environments: ['production', 'staging'] });
  const revoked = await admin.apiKeys.revoke('key_new');

  assert.equal(http.calls.get.at(-1).path, '/platform/orgs/org_42/api-keys');
  assert.equal(listed[0].id, 'key_1');
  assert.equal(created._path, '/platform/projects/proj_9/api-keys');
  assert.deepEqual(http.calls.post.at(-1).options.body, { name: 'web', allowedEnvironments: ['production'] });
  assert.equal(created.rawKey, 'snk_proj_secret');
  assert.equal(updated._path, '/platform/api-keys/key_new');
  assert.deepEqual(updated._body, { name: 'web-prod', allowedEnvironments: ['production', 'staging'] });
  assert.deepEqual(revoked, { success: true, _path: '/platform/api-keys/key_new' });
});

test('AdminClient bootstrapProject creates project + key and returns a project-scoped client', async () => {
  const http = createHttpStub({
    orgId: 'org_42',
    baseUrl: 'https://api.stacknodo.com',
    postImpl: async (path, options) => {
      if (path === '/platform/orgs/org_42/projects') {
        return { data: { _id: 'proj_new', name: options.body.name } };
      }
      if (path === '/platform/projects/proj_new/api-keys') {
        return { data: { id: 'key_new', name: options.body.name, rawKey: 'snk_proj_rawsecret', prefix: 'ef56', scope: 'project', allowedEnvironments: options.body.allowedEnvironments ?? null, createdAt: '2026-01-01' } };
      }
      throw new Error(`unexpected POST ${path}`);
    },
  });

  const admin = new AdminClient(http);
  const result = await admin.bootstrapProject({ name: 'Stamplyse', environments: ['production'] });

  assert.equal(result.project._id, 'proj_new');
  assert.equal(result.apiKey.id, 'key_new');
  assert.equal(result.apiKey.scope, 'project');
  assert.equal(result.apiKey.rawKey, undefined); // metadata must not echo the raw key
  assert.equal(result.rawKey, 'snk_proj_rawsecret'); // returned once when no persist callback
  // The returned client is project-scoped and authenticated with the new key.
  assert.equal(result.client.constructor.name, 'Stacknodo');
  assert.equal(result.client._http.apiKey, 'snk_proj_rawsecret');
  assert.equal(result.client._http.projectId, 'proj_new');
  assert.equal(result.client._http.environment, 'production');
});

test('AdminClient bootstrapProject with persist callback withholds the raw key from the result', async () => {
  const http = createHttpStub({
    orgId: 'org_42',
    postImpl: async (path, options) => {
      if (path.endsWith('/projects')) return { data: { id: 'proj_p', name: options.body.name } };
      return { data: { id: 'key_p', name: options.body.name, rawKey: 'snk_proj_persisted', prefix: 'gh78', scope: 'project', allowedEnvironments: null } };
    },
  });

  const admin = new AdminClient(http);
  const persisted = [];
  const metaSeen = [];
  const result = await admin.bootstrapProject({
    name: 'Vault',
    persist: async (rawKey, meta) => { persisted.push(rawKey); metaSeen.push(meta); },
  });

  assert.deepEqual(persisted, ['snk_proj_persisted']);
  assert.equal(result.rawKey, undefined); // not returned when persisted
  assert.equal(result.client._http.apiKey, 'snk_proj_persisted'); // client still authenticated
  // The callback receives project + key metadata so it can key the secret by
  // project id without a TDZ reference to the not-yet-returned result.
  assert.equal(metaSeen.length, 1);
  assert.equal(metaSeen[0].project.id, 'proj_p');
  assert.equal(metaSeen[0].apiKey.id, 'key_p');
  assert.equal(metaSeen[0].apiKey.rawKey, undefined); // metadata only, never the secret
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