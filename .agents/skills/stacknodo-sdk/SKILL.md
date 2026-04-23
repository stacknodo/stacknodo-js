---
name: stacknodo-sdk
description: >-
  Guides Stacknodo SDK usage — data queries (CRUD, filters, pagination),
  authentication, file storage (upload, download, metadata queries),
  row-level security configuration, schema management, webhooks, AI agent API,
  custom functions, real-time subscriptions, and error handling. Use when building,
  modifying, or reviewing any Stacknodo integration.
---

Always use the latest SDK.

## Installation

```bash
npm i --foreground-scripts @stacknodo/sdk
```

If you want coding agents to discover this skill from the **project root**, install the local agent entrypoint too:

```bash
npx stacknodo agent install
```

That copies this local skill entrypoint into `.agents/skills/stacknodo-sdk/` in the current project.

## Agent Context

This file is a **lightweight local entrypoint**, not a complete local mirror of the Stacknodo docs or of your project's schema.

When doing Stacknodo-specific work, prefer fetching **live** context over HTTP:

1. **Live Stacknodo docs:**
  `GET https://docs.stacknodo.com/api/docs.md`

2. **Live project schema:**
  `GET https://api.stacknodo.com/platform/projects/${STACKNODO_PROJECT_ID}/schema.json`
  *(Headers: `Authorization: Bearer ${STACKNODO_API_KEY}`)*

Use this local skill file as the starting point, then use the live HTTP endpoints above as the source of truth whenever possible.

### Token Quick Reference

- Use a **project API key** (`snk_proj_...`) for the SDK, `schema.json`, `/data`, `/files`, and `/platform/ai-agent`.
- Use an **organisation API key** (`snk_org_...`) when the agent or script needs cross-project access.
- Use a **platform JWT** only when you intentionally want member-scoped platform access.
- Do **not** use legacy `/api/auth/login` JWTs with `/platform`, `/data`, or `schema.json`.

### Recommended Workflow

1. Fetch `https://docs.stacknodo.com/api/docs.md` for current Stacknodo behavior, platform conventions, and official guidance.
2. Fetch `https://api.stacknodo.com/platform/projects/${STACKNODO_PROJECT_ID}/schema.json` for the live structure of the user's actual project.
3. Use both together: `docs.md` explains how Stacknodo works, while `schema.json` shows what exists in this specific project.

## Quick Start

```js
import { Stacknodo } from '@stacknodo/sdk';

const client = new Stacknodo({
  projectId: process.env.STACKNODO_PROJECT_ID,
  apiKey: process.env.STACKNODO_API_KEY,
  environment: 'production',
});

const posts = await client.from('posts')
  .select('title', 'body')
  .eq('published', true)
  .order('createdAt', 'desc')
  .limit(20);
```

## Topic Routing

When you need topic-specific guidance, fetch `https://docs.stacknodo.com/api/docs.md` and use the relevant sections there:

- `Node.js SDK`
- `File Storage`
- `Authentication`
- `Row-Level Security (RLS)`
- `AI Agent API`
- `Real-Time Subscriptions`
- `Error Handling`

Use `schema.json` alongside those docs whenever you need the live tables, fields, relations, or environment-specific structure for the target project.

## Core Principles

1. **Zero dependencies** — The SDK uses native `fetch()`. Node 18+ required.
2. **Lazy resolution** — The `databaseId` is resolved automatically from `projectId` + `environment` on first request.
3. **Thenable query builder** — `client.from('table')` returns a chainable builder that executes when awaited.
4. **Namespace pattern** — `client.storage`, `client.platformAuth`, `client.ai`, `client.admin`, `client.realtime` are lazy-loaded sub-clients. `client.auth` remains a compatibility alias for `client.platformAuth`.
5. **Environment-aware** — One API key works across production, staging, and development environments.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STACKNODO_PROJECT_ID` | Project ID |
| `STACKNODO_API_KEY` | API key (`snk_proj_...` or `snk_org_...`) |
| `STACKNODO_ENV` | Environment: `production` (default), `staging`, `development` |

The API base URL is hardcoded internally based on the environment and does not require an environment variable.

```js
// Auto-configure from env vars
const client = Stacknodo.fromEnv();
```

## Live Stacknodo Context

For accurate agent output, use both live sources below instead of relying only on this local file:

### 1. Live Stacknodo Docs

Fetch the latest Stacknodo documentation and platform guidance:

`GET https://docs.stacknodo.com/api/docs.md`

Use `docs.md` for:
- Platform behavior and conventions
- Official best practices
- Feature workflows and product semantics
- Guidance that is not specific to one project's schema

### 2. Live Project Schema

Fetch the current project schema when you need the real tables, fields, relations, or RLS rules for the target project:

`GET https://api.stacknodo.com/platform/projects/${STACKNODO_PROJECT_ID}/schema.json`
*(Headers: `Authorization: Bearer ${STACKNODO_API_KEY}`)*

Use `schema.json` for:
- Verifying fields before writing queries
- Confirming table names, relations, and data types
- Inspecting RLS-relevant structure
- Understanding the exact project shape in the target environment

**Important:** The returned payload contains an array of `databases` representing different environments (e.g., development, staging, production). Inspect the database corresponding to the target environment (for example, `data.databases.find(db => db.environment === 'development')`) before executing queries or generating code.
