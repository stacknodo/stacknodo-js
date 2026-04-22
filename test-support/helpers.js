import { TextEncoder } from 'node:util';

function normaliseSessionPayload(payload = {}) {
  return {
    accessToken: payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token || null,
    refreshToken: payload?.refreshToken || payload?.data?.refreshToken || null,
    expiresIn: payload?.expiresIn ?? payload?.data?.expiresIn ?? null,
    session: payload?.session || payload?.data?.session || null,
  };
}

export function createHttpMock(overrides = {}) {
  const calls = {
    resolveDbId: 0,
    get: [],
    post: [],
    put: [],
    del: [],
    request: [],
    setPlatformSession: [],
    clearPlatformSession: 0,
    getPlatformSession: 0,
    setDataSession: [],
    clearDataSession: 0,
    getDataSession: 0,
    refreshPlatformSession: 0,
    refreshDataSession: 0,
  };

  const state = {
    platformSession: overrides.platformSession ?? null,
    dataSession: overrides.dataSession ?? null,
  };

  async function respond(method, path, options) {
    const handler = overrides[method];

    if (typeof handler === 'function') {
      return handler(path, options, calls);
    }

    if (handler !== undefined) {
      return handler;
    }

    return { data: { path, options } };
  }

  return {
    projectId: overrides.projectId ?? 'proj_test',
    apiKey: overrides.apiKey ?? 'snk_proj_test',
    baseUrl: overrides.baseUrl ?? 'https://api.stacknodo.com',
    calls,
    async resolveDbId() {
      calls.resolveDbId += 1;
      if (typeof overrides.resolveDbId === 'function') {
        return overrides.resolveDbId(calls);
      }
      return overrides.dbId ?? 'db_test';
    },
    async get(path, options) {
      calls.get.push({ path, options });
      return respond('get', path, options);
    },
    async post(path, options) {
      calls.post.push({ path, options });
      return respond('post', path, options);
    },
    async put(path, options) {
      calls.put.push({ path, options });
      return respond('put', path, options);
    },
    async del(path, options) {
      calls.del.push({ path, options });
      return respond('del', path, options);
    },
    async request(method, path, options) {
      calls.request.push({ method, path, options });
      if (typeof overrides.request === 'function') {
        return overrides.request(method, path, options, calls);
      }
      if (overrides.request !== undefined) {
        return overrides.request;
      }
      return { data: { method, path, options } };
    },
    setPlatformSession(payload) {
      calls.setPlatformSession.push(payload);
      state.platformSession = payload;
    },
    clearPlatformSession() {
      calls.clearPlatformSession += 1;
      state.platformSession = null;
    },
    getPlatformSession() {
      calls.getPlatformSession += 1;
      return state.platformSession;
    },
    setDataSession(payload) {
      calls.setDataSession.push(payload);
      state.dataSession = payload;
    },
    clearDataSession() {
      calls.clearDataSession += 1;
      state.dataSession = null;
    },
    getDataSession() {
      calls.getDataSession += 1;
      return state.dataSession;
    },
    async refreshPlatformSession() {
      calls.refreshPlatformSession += 1;
      if (typeof overrides.refreshPlatformSession === 'function') {
        return overrides.refreshPlatformSession(calls);
      }
      return state.platformSession;
    },
    async refreshDataSession() {
      calls.refreshDataSession += 1;
      if (typeof overrides.refreshDataSession === 'function') {
        return overrides.refreshDataSession(calls);
      }
      return state.dataSession;
    },
  };
}

export function createHttpStub({
  dbId = 'db_test',
  projectId = 'proj_test',
  baseUrl = 'https://api.stacknodo.com',
  apiKey = 'snk_proj_test',
  getImpl = async () => ({ data: null }),
  postImpl = async () => ({ data: null }),
  putImpl = async () => ({ data: null }),
  delImpl = async () => ({ data: null }),
  requestImpl = async () => ({ data: null }),
  refreshPlatformSessionImpl = async () => ({ accessToken: 'platform_refresh' }),
  refreshDataSessionImpl = async () => ({ accessToken: 'data_refresh' }),
  platformSession = null,
  dataSession = null,
} = {}) {
  const calls = {
    resolveDbId: 0,
    get: [],
    post: [],
    put: [],
    del: [],
    request: [],
    setPlatformSession: [],
    clearPlatformSession: 0,
    getPlatformSession: 0,
    refreshPlatformSession: 0,
    setDataSession: [],
    clearDataSession: 0,
    getDataSession: 0,
    refreshDataSession: 0,
  };

  let currentPlatformSession = platformSession ? normaliseSessionPayload(platformSession) : null;
  let currentDataSession = dataSession ? normaliseSessionPayload(dataSession) : null;

  return {
    projectId,
    baseUrl,
    apiKey,
    calls,
    async resolveDbId() {
      calls.resolveDbId += 1;
      return typeof dbId === 'function' ? dbId() : dbId;
    },
    async get(path, options) {
      calls.get.push({ path, options });
      return getImpl(path, options);
    },
    async post(path, options) {
      calls.post.push({ path, options });
      return postImpl(path, options);
    },
    async put(path, options) {
      calls.put.push({ path, options });
      return putImpl(path, options);
    },
    async del(path, options) {
      calls.del.push({ path, options });
      return delImpl(path, options);
    },
    async request(method, path, options) {
      calls.request.push({ method, path, options });
      return requestImpl(method, path, options);
    },
    setPlatformSession(payload) {
      calls.setPlatformSession.push(payload);
      currentPlatformSession = normaliseSessionPayload(payload);
    },
    clearPlatformSession() {
      calls.clearPlatformSession += 1;
      currentPlatformSession = null;
    },
    getPlatformSession() {
      calls.getPlatformSession += 1;
      return currentPlatformSession;
    },
    async refreshPlatformSession() {
      calls.refreshPlatformSession += 1;
      return refreshPlatformSessionImpl();
    },
    setDataSession(payload) {
      calls.setDataSession.push(payload);
      currentDataSession = normaliseSessionPayload(payload);
    },
    clearDataSession() {
      calls.clearDataSession += 1;
      currentDataSession = null;
    },
    getDataSession() {
      calls.getDataSession += 1;
      return currentDataSession;
    },
    async refreshDataSession() {
      calls.refreshDataSession += 1;
      return refreshDataSessionImpl();
    },
  };
}

export function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

export async function withEnv(env, callback) {
  const previous = new Map();

  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function mockFetch(testContext, implementation) {
  const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  testContext.after(() => {
    if (hadFetch) {
      globalThis.fetch = original;
    } else {
      delete globalThis.fetch;
    }
  });
}

export function createSseResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  let released = false;

  return {
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            return { done: false, value: encoder.encode(chunks[index++]) };
          },
          releaseLock() {
            released = true;
          },
        };
      },
    },
    wasReleased() {
      return released;
    },
  };
}

export async function collectAsyncIterable(iterable) {
  const items = [];

  for await (const item of iterable) {
    items.push(item);
  }

  return items;
}