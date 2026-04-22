import assert from 'node:assert/strict';
import test from 'node:test';

import { QueryBuilder } from '../src/query-builder.js';

function createHttpStub({ dbId = 'db_test', getResult = { data: [] } } = {}) {
  const calls = {
    resolveDbId: 0,
    get: [],
    post: [],
    put: [],
    del: [],
  };

  return {
    calls,
    async resolveDbId() {
      calls.resolveDbId += 1;
      return dbId;
    },
    async get(path, options) {
      calls.get.push({ path, options });
      return typeof getResult === 'function' ? getResult(path, options) : getResult;
    },
    async post(path, options) {
      calls.post.push({ path, options });
      return { data: { path, options } };
    },
    async put(path, options) {
      calls.put.push({ path, options });
      return { data: { path, options } };
    },
    async del(path, options) {
      calls.del.push({ path, options });
      return { data: { path, options } };
    },
  };
}

test('builds structured query params from chained filters', () => {
  const builder = new QueryBuilder(createHttpStub(), 'posts')
    .select('title', 'body')
    .eq('published', true)
    .gt('views', 10)
    .contains('title', 'stacknodo')
    .order('createdAt', 'desc')
    .limit(20)
    .offset(5)
    .expand('author', 'comments');

  assert.deepEqual(builder._buildQuery(), {
    filter: JSON.stringify({
      published: true,
      views: { $gt: 10 },
      title: { $contains: 'stacknodo' },
    }),
    fields: 'title,body',
    sort: 'createdAt',
    sortDir: 'desc',
    limit: 20,
    offset: 5,
    expand: 'author,comments',
  });
});

test('awaiting the builder resolves the database path and unwraps response data', async () => {
  const http = createHttpStub({
    dbId: 'db_prod',
    getResult: { data: [{ _id: '1', title: 'Hello' }] },
  });

  const rows = await new QueryBuilder(http, 'posts')
    .eq('published', true)
    .limit(10);

  assert.deepEqual(rows, [{ _id: '1', title: 'Hello' }]);
  assert.equal(http.calls.resolveDbId, 1);
  assert.deepEqual(http.calls.get, [
    {
      path: '/data/db_prod/posts',
      options: {
        query: {
          filter: JSON.stringify({ published: true }),
          limit: 10,
        },
      },
    },
  ]);
});

test('CRUD helpers call the expected data endpoints', async () => {
  const http = createHttpStub({ dbId: 'db_dev' });
  const builder = new QueryBuilder(http, 'users');

  await builder.get('user_1');
  await builder.create({ name: 'Ada' });
  await builder.update('user_1', { name: 'Grace' });
  await builder.delete('user_1');

  assert.deepEqual(http.calls.get.at(-1), {
    path: '/data/db_dev/users/user_1',
    options: undefined,
  });
  assert.deepEqual(http.calls.post[0], {
    path: '/data/db_dev/users',
    options: { body: { name: 'Ada' } },
  });
  assert.deepEqual(http.calls.put[0], {
    path: '/data/db_dev/users/user_1',
    options: { body: { name: 'Grace' } },
  });
  assert.deepEqual(http.calls.del[0], {
    path: '/data/db_dev/users/user_1',
    options: undefined,
  });
});