import assert from 'node:assert/strict';
import test from 'node:test';

import { DataAuthClient, PlatformAuthClient } from '../src/auth.js';
import { createHttpMock } from '../test-support/helpers.js';

test('platform login normalizes the auth result and stores the session', async () => {
  const response = {
    data: {
      accessToken: 'platform-token',
      refreshToken: 'platform-refresh',
      user: { _id: 'member_1' },
    },
  };

  const http = createHttpMock({ post: response });
  const client = new PlatformAuthClient(http);

  const session = await client.login({ email: 'owner@example.com', password: 'secret' });

  assert.deepEqual(http.calls.post[0], {
    path: '/platform/auth/login',
    options: {
      body: { email: 'owner@example.com', password: 'secret' },
      auth: 'none',
    },
  });
  assert.deepEqual(session, {
    token: 'platform-token',
    accessToken: 'platform-token',
    refreshToken: 'platform-refresh',
    user: { _id: 'member_1' },
  });
  assert.deepEqual(http.calls.setPlatformSession, [response]);
});

test('platform logout revokes by refresh token when one is present and clears local state', async () => {
  const http = createHttpMock({
    platformSession: {
      accessToken: 'platform-token',
      refreshToken: 'platform-refresh',
    },
    post: { success: true },
  });

  const client = new PlatformAuthClient(http);
  await client.logout();

  assert.deepEqual(http.calls.post[0], {
    path: '/platform/auth/logout',
    options: {
      body: { refreshToken: 'platform-refresh' },
      auth: 'none',
    },
  });
  assert.equal(http.calls.clearPlatformSession, 1);
});

test('data auth uses database-scoped routes for login, me, and logout', async () => {
  const loginResponse = {
    accessToken: 'data-token',
    refreshToken: 'data-refresh',
    user: { _id: 'user_1' },
  };

  const http = createHttpMock({
    dbId: 'db_789',
    dataSession: {
      accessToken: 'data-token',
      refreshToken: 'data-refresh',
    },
    post(path) {
      if (path.endsWith('/login')) {
        return loginResponse;
      }
      return { success: true };
    },
    get: { data: { user: { _id: 'user_1', email: 'user@example.com' } } },
  });

  const client = new DataAuthClient(http);
  const session = await client.login({ email: 'user@example.com', password: 'secret' });
  const user = await client.getUser();
  await client.logout();

  assert.deepEqual(session, {
    token: 'data-token',
    accessToken: 'data-token',
    refreshToken: 'data-refresh',
    user: { _id: 'user_1' },
  });
  assert.deepEqual(user, { _id: 'user_1', email: 'user@example.com' });
  assert.deepEqual(http.calls.post[0], {
    path: '/data/db_789/auth/login',
    options: {
      body: { email: 'user@example.com', password: 'secret' },
      auth: 'none',
    },
  });
  assert.deepEqual(http.calls.get[0], {
    path: '/data/db_789/auth/me',
    options: { auth: 'dataSession' },
  });
  assert.deepEqual(http.calls.post[1], {
    path: '/data/db_789/auth/logout',
    options: {
      body: { refreshToken: 'data-refresh' },
      auth: 'none',
    },
  });
  assert.deepEqual(http.calls.setDataSession, [loginResponse]);
  assert.equal(http.calls.clearDataSession, 1);
});