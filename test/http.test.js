import assert from 'node:assert/strict';
import test from 'node:test';

import { StacknodoError } from '../src/errors.js';
import { HttpClient } from '../src/http.js';
import { createJwt, mockFetch } from '../test-support/helpers.js';

test('resolveDbId caches the environment-specific database id', async () => {
  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'staging',
    timeout: 1000,
  });

  let calls = 0;
  client.request = async (method, path) => {
    calls += 1;
    assert.equal(method, 'GET');
    assert.equal(path, '/platform/projects/proj_123/databases');

    return {
      data: [
        { _id: 'db_prod', environment: 'production' },
        { _id: 'db_stage', environment: 'staging' },
      ],
    };
  };

  assert.equal(await client.resolveDbId(), 'db_stage');
  assert.equal(await client.resolveDbId(), 'db_stage');
  assert.equal(calls, 1);
});

test('resolveDbId uses the public keyless resolver when no API key is set', async () => {
  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: undefined,
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return {
      success: true,
      data: { databaseId: 'db_prod', environment: 'production', projectId: 'proj_123' },
    };
  };

  assert.equal(await client.resolveDbId(), 'db_prod');
  assert.equal(await client.resolveDbId(), 'db_prod'); // cached, no second request
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/platform/projects/proj_123/database-id');
  assert.deepEqual(calls[0].opts.query, { environment: 'production' });
  assert.equal(calls[0].opts.auth, 'none');
});

test('getRealtimeToken prefers apiKey, then data session, then platform session', async () => {
  const withKey = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });
  assert.equal(await withKey.getRealtimeToken(), 'snk_proj_test');

  const keyless = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: undefined,
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });
  assert.equal(await keyless.getRealtimeToken(), null);

  keyless.setPlatformSession({ accessToken: 'platform_tok' });
  assert.equal(await keyless.getRealtimeToken(), 'platform_tok');

  keyless.setDataSession({ accessToken: 'data_tok' });
  assert.equal(await keyless.getRealtimeToken(), 'data_tok'); // data session wins over platform
});

test('getRealtimeToken keeps the still-valid token when a best-effort refresh fails', async () => {
  const keyless = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: undefined,
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });
  keyless._dbId = 'db_live';
  keyless.setDataSession({ accessToken: 'data_tok', refreshToken: 'refresh_tok' });

  // Force the refresh path and mirror the real failure behavior: _refreshSession()
  // clears the session state before rethrowing.
  keyless._shouldRefreshSession = () => true;
  keyless._refreshSession = async (mode) => {
    keyless._clearSessionState(mode);
    throw new Error('transient network failure');
  };

  assert.equal(await keyless.getRealtimeToken(), 'data_tok');
  assert.equal(keyless.getDataSession()?.accessToken, 'data_tok'); // session restored
});

test('request sends project headers, API key auth, and JSON body', async (t) => {
  const seen = [];
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com/',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'staging',
    timeout: 1000,
  });

  const result = await client.request('POST', '/platform/test', {
    query: { limit: 2, ignored: null },
    body: { hello: 'world' },
    headers: { 'X-Custom': 'yes' },
  });

  assert.deepEqual(result, { success: true, data: { ok: true } });
  assert.equal(seen[0].url, 'https://api.stacknodo.com/platform/test?limit=2');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer snk_proj_test');
  assert.equal(seen[0].init.headers['X-Stacknodo-Project'], 'proj_123');
  assert.equal(seen[0].init.headers['X-Stacknodo-Environment'], 'staging');
  assert.equal(seen[0].init.headers['X-Custom'], 'yes');
  assert.equal(seen[0].init.headers['Content-Type'], 'application/json');
  assert.equal(seen[0].init.body, JSON.stringify({ hello: 'world' }));
});

test('data requests use the active data session token automatically', async (t) => {
  const seen = [];
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  client.setDataSession({
    accessToken: 'data-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  });

  await client.request('GET', '/data/db_123/posts');
  assert.equal(seen[0].url, 'https://api.stacknodo.com/data/db_123/posts');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer data-token');
});

test('platform session refreshes before expiry and retries with the new token', async () => {
  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  client.setPlatformSession({
    accessToken: createJwt({ exp: Math.floor((Date.now() + 5000) / 1000) }),
    refreshToken: 'platform-refresh',
  });

  const calls = [];
  client._performRequest = async (method, path, options, token) => {
    calls.push({ method, path, options, token });

    if (path === '/platform/auth/refresh') {
      return {
        accessToken: 'platform-token-new',
        refreshToken: 'platform-refresh-new',
        expiresIn: 3600,
      };
    }

    return { data: { id: 'member_1' } };
  };

  const result = await client.request('GET', '/platform/auth/me', { auth: 'platformSession' });

  assert.deepEqual(result, { data: { id: 'member_1' } });
  assert.deepEqual(calls.map((call) => call.path), ['/platform/auth/refresh', '/platform/auth/me']);
  assert.equal(calls[1].token, 'platform-token-new');
});

test('data session retries once after a 401 by refreshing against the request db id', async () => {
  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  client.setDataSession({
    accessToken: 'data-token-old',
    refreshToken: 'data-refresh-old',
    expiresIn: 3600,
  });

  const calls = [];
  client._performRequest = async (method, path, options, token) => {
    calls.push({ method, path, options, token });

    if (path === '/data/db_456/auth/refresh') {
      return {
        accessToken: 'data-token-new',
        refreshToken: 'data-refresh-new',
        expiresIn: 3600,
      };
    }

    if (path === '/data/db_456/posts' && token === 'data-token-old') {
      throw new StacknodoError('Unauthorized', { status: 401, code: 'UNAUTHORIZED' });
    }

    return { data: [{ _id: 'post_1' }] };
  };

  const result = await client.request('GET', '/data/db_456/posts');

  assert.deepEqual(result, { data: [{ _id: 'post_1' }] });
  assert.deepEqual(calls.map((call) => [call.path, call.token]), [
    ['/data/db_456/posts', 'data-token-old'],
    ['/data/db_456/auth/refresh', null],
    ['/data/db_456/posts', 'data-token-new'],
  ]);
  assert.equal(client.getDataSession().accessToken, 'data-token-new');
});

test('resolveOrgId caches the org id from /platform/orgs/current', async () => {
  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_org_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  let calls = 0;
  client.request = async (method, path) => {
    calls += 1;
    assert.equal(method, 'GET');
    assert.equal(path, '/platform/orgs/current');
    return { data: { id: 'org_live', name: 'Acme', slug: 'acme', role: 'org-admin' } };
  };

  assert.equal(await client.resolveOrgId(), 'org_live');
  assert.equal(await client.resolveOrgId(), 'org_live');
  assert.equal(calls, 1);
});

test('an org key used for data access warns once', async (t) => {
  mockFetch(t, async () => new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  t.after(() => { console.warn = originalWarn; });

  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_org_secret',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  await client.request('GET', '/data/db_123/posts');
  await client.request('GET', '/data/db_123/comments');
  // Platform/admin paths with the same org key must never warn.
  await client.request('GET', '/platform/orgs/current');

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Org keys are management-only/);
  assert.match(warnings[0], /snk_proj_/);
});

test('a project key used for data access does not warn', async (t) => {
  mockFetch(t, async () => new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  t.after(() => { console.warn = originalWarn; });

  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_secret',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  await client.request('GET', '/data/db_123/posts');
  assert.equal(warnings.length, 0);
});

test('network failures are normalized into StacknodoError instances', async (t) => {
  mockFetch(t, async () => {
    throw new Error('socket hang up');
  });

  const client = new HttpClient({
    baseUrl: 'https://api.stacknodo.com',
    apiKey: 'snk_proj_test',
    projectId: 'proj_123',
    environment: 'production',
    timeout: 1000,
  });

  await assert.rejects(
    client.request('GET', '/platform/test'),
    (error) => error instanceof StacknodoError && error.code === 'NETWORK_ERROR' && error.message === 'socket hang up',
  );
});