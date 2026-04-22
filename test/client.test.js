import assert from 'node:assert/strict';
import test from 'node:test';

import { Stacknodo, createEnvironments } from '../src/client.js';
import { QueryBuilder } from '../src/query-builder.js';
import { withEnv } from '../test-support/helpers.js';

test('constructor validates required config and seeds an explicit database id', () => {
  assert.throws(() => new Stacknodo({ apiKey: 'snk_proj_test' }), /projectId is required/);
  assert.throws(() => new Stacknodo({ projectId: 'proj_123' }), /apiKey is required/);

  const client = new Stacknodo({
    projectId: 'proj_123',
    apiKey: 'snk_proj_test',
    databaseId: 'db_123',
  });

  assert.equal(client._http._dbId, 'db_123');
  assert.ok(client.from('posts') instanceof QueryBuilder);
});

test('lazy namespaces are cached and auth is an alias for platformAuth', () => {
  const client = new Stacknodo({
    projectId: 'proj_123',
    apiKey: 'snk_proj_test',
  });

  assert.equal(client.storage, client.storage);
  assert.equal(client.platformAuth, client.platformAuth);
  assert.equal(client.dataAuth, client.dataAuth);
  assert.equal(client.ai, client.ai);
  assert.equal(client.functions, client.functions);
  assert.equal(client.realtime, client.realtime);
  assert.equal(client.admin, client.admin);
  assert.equal(client.auth, client.platformAuth);
});

test('fromEnv reads the documented environment variables', async () => {
  await withEnv({
    STACKNODO_PROJECT_ID: 'proj_env',
    STACKNODO_API_KEY: 'snk_proj_env',
    STACKNODO_ENV: 'development',
    STACKNODO_BASE_URL: 'https://custom.stacknodo.test',
  }, async () => {
    const client = Stacknodo.fromEnv();

    assert.equal(client._http.projectId, 'proj_env');
    assert.equal(client._http.apiKey, 'snk_proj_env');
    assert.equal(client._http.environment, 'development');
    assert.equal(client._http.baseUrl, 'https://custom.stacknodo.test');
  });
});

test('createEnvironments returns one client per supported environment', () => {
  const environments = createEnvironments({
    projectId: 'proj_123',
    apiKey: 'snk_proj_test',
    baseUrl: 'https://api.stacknodo.test',
  });

  assert.equal(environments.production._http.environment, 'production');
  assert.equal(environments.staging._http.environment, 'staging');
  assert.equal(environments.development._http.environment, 'development');
  assert.equal(environments.production._http.baseUrl, 'https://api.stacknodo.test');
});