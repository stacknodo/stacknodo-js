# Stacknodo JavaScript SDK

Official JavaScript SDK for Stacknodo Cloud.

Use this package to:

- query and mutate table data
- work with file storage tables
- sign in platform members or database users
- call the AI Agent API
- invoke custom runtime functions
- subscribe to real-time record changes
- run project and schema admin workflows

This package targets Stacknodo Cloud routes such as `/platform`, `/data`, `/files`, `/realtime`, and `/run`.

## Install

Requirements:

- Node.js 18+
- a Stacknodo project ID (`proj_...`)
- a Stacknodo project API key (`snk_proj_...`) or organisation API key (`snk_org_...`)

Install the SDK:

```bash
npm i --foreground-scripts @stacknodo/sdk
```

### Coding Agent Install

If you use GitHub Copilot, Cursor, Windsurf, or another coding agent, install the bundled Stacknodo skill entrypoint into your project root right after installing the package:

```bash
npx stacknodo agent install
```

That creates:

```text
.agents/skills/stacknodo-sdk/
```

This helps coding agents discover the live Stacknodo docs and your project schema more reliably.

The package also ships with a small CLI called `stacknodo`.

## What You Need Before Your First Request

1. Create or open a Stacknodo project.
2. Copy the project ID.
3. Create a project API key from the Stacknodo dashboard.
4. Decide which environment you want to target: `production`, `staging`, or `development`.

If you are new to Stacknodo, start with a project API key. It is the simplest path and matches how the SDK is designed to be used.

### Token Guide

| Token | Best for | Works with this SDK? |
| --- | --- | --- |
| Project API key (`snk_proj_...`) | Normal app and backend usage for one project | Yes |
| Organisation API key (`snk_org_...`) | Cross-project tools and admin scripts, especially `client.admin` | Yes |
| Platform session token | Acting as a real Stacknodo member | Yes, through `client.platformAuth` |
| Database user token | Acting as an end user with RLS applied | Yes, through `client.dataAuth` |
| API Docs test token | Manual one-database testing in curl or Postman | Usually no, prefer API keys in the SDK |

### Project ID vs Database ID

- `projectId` identifies the whole Stacknodo project. The SDK constructor uses this.
- `databaseId` identifies one concrete environment database. The SDK resolves it for you automatically.
- If you already know the exact database ID, you can pass `databaseId` to the constructor to skip the lazy lookup.

## Detailed Onboarding

### 1. Set environment variables

```bash
export STACKNODO_PROJECT_ID=proj_your_project_id
export STACKNODO_API_KEY=snk_proj_your_api_key
export STACKNODO_ENV=production
```

Optional:

```bash
export STACKNODO_BASE_URL=https://api.stacknodo.com
```

### 2. Run a shell smoke test

This is the fastest way to verify your project ID, API key, and environment are all correct.

```bash
node --input-type=module <<'EOF'
import { Stacknodo } from '@stacknodo/sdk';

const client = Stacknodo.fromEnv();
const rows = await client.from('posts').limit(5);

console.log(rows);
EOF
```

If your project does not have a `posts` table yet, replace it with any table that already exists.

### 3. Create your first client

```js
import { Stacknodo } from '@stacknodo/sdk';

const client = Stacknodo.fromEnv();
```

You can also configure it manually:

```js
import { Stacknodo } from '@stacknodo/sdk';

const client = new Stacknodo({
  projectId: 'proj_shop_123',
  apiKey: process.env.STACKNODO_API_KEY,
  environment: 'production',
  timeout: 10000,
});
```

### 4. Run your first query

```js
const products = await client.from('products')
  .select('name', 'price')
  .gt('price', 0)
  .order('name', 'asc')
  .limit(5);

console.log(products);
```

### 5. Create a first record

```js
const order = await client.from('orders').create({
  customerName: 'Mia',
  total: 49.99,
  paid: false,
});

console.log(order);
```

## Quick Start

```js
import { Stacknodo } from '@stacknodo/sdk';

const client = new Stacknodo({
  projectId: process.env.STACKNODO_PROJECT_ID,
  apiKey: process.env.STACKNODO_API_KEY,
  environment: process.env.STACKNODO_ENV || 'production',
});

const posts = await client.from('posts')
  .select('title', 'body')
  .eq('published', true)
  .order('createdAt', 'desc')
  .limit(20);

const post = await client.from('posts').create({
  title: 'Hello from Stacknodo',
  body: 'My first SDK write.',
  published: true,
});

console.log({ posts, post });
```

## Core Concepts

### The query builder is thenable

`client.from('table')` returns a chainable query builder. It does not execute until you `await` it.

```js
const query = client.from('tickets').eq('status', 'open').limit(10);

const tickets = await query;
```

### Data-user auth is automatic once you log in

After `client.dataAuth.login(...)`, normal `client.from(...)` queries and `client.storage...` requests automatically use the database-user session instead of the original API key. That means Row-Level Security applies without extra headers.

### User sessions are handled for you

When you sign in a database user, the SDK takes care of the usual session plumbing:

- stores the access token and refresh token internally
- switches normal `client.from(...)` and `client.storage...` calls to the signed-in user automatically
- refreshes expiring user access tokens automatically when possible
- gives you `getUser()` for the current signed-in user
- gives you `logout()` to revoke the session and clear local state

In practice, this means you usually call `login()` once and then write normal data or file operations without manually passing tokens around.

### Platform auth is separate from database-user auth

- `client.platformAuth` is for Stacknodo member flows such as `/platform/auth/me`.
- `client.dataAuth` is for end-user flows such as `/data/{dbId}/auth/login`.

### Common auth modes

Recommended default: API key only.

```js
const client = new Stacknodo({
  projectId: 'proj_abc123',
  apiKey: process.env.STACKNODO_API_KEY,
});

const posts = await client.from('posts').limit(20);
```

Platform member session: platform-member calls use the member session, but normal data calls still use your API key unless you also log in as a data user.

```js
const client = new Stacknodo({
  projectId: 'proj_abc123',
  apiKey: process.env.STACKNODO_API_KEY,
});

await client.platformAuth.login({
  email: 'owner@example.com',
  password: 'secret',
});

const me = await client.platformAuth.getUser();
const posts = await client.from('posts').limit(20);

console.log({ me, posts });
```

Database-user session: once logged in, normal data and storage calls automatically switch to the database-user session.

```js
const client = new Stacknodo({
  projectId: 'proj_abc123',
  apiKey: process.env.STACKNODO_API_KEY,
});

await client.dataAuth.login({
  email: 'customer@example.com',
  password: 'secret',
});

const posts = await client.from('posts').limit(20);
await client.storage.from('media').upload(Buffer.from('avatar'), {
  filename: 'avatar.txt',
});
```

## Client Setup

### `new Stacknodo(options)`

Create a client manually.

```js
import { Stacknodo } from '@stacknodo/sdk';

const client = new Stacknodo({
  projectId: 'proj_blog_123',
  apiKey: process.env.STACKNODO_API_KEY,
  environment: 'staging',
  timeout: 15000,
});
```

Options:

| Option | Required | Description |
| --- | --- | --- |
| `projectId` | Yes | Stacknodo project ID |
| `apiKey` | Yes | Project or organisation API key |
| `environment` | No | `production`, `staging`, or `development` |
| `baseUrl` | No | API base URL, defaults to `https://api.stacknodo.com` |
| `timeout` | No | Request timeout in milliseconds |
| `databaseId` | No | Skip lazy environment database lookup |

### `Stacknodo.fromEnv()`

Create a client from environment variables.

```js
const client = Stacknodo.fromEnv();
```

Used environment variables:

| Variable | Description |
| --- | --- |
| `STACKNODO_PROJECT_ID` | Project ID |
| `STACKNODO_API_KEY` | Project or organisation API key |
| `STACKNODO_ENV` | `production`, `staging`, or `development` |
| `STACKNODO_BASE_URL` | Custom API base URL |

### `createEnvironments(options)`

Create one client per supported environment.

Simple real-life example: your deployment script writes data to staging first, then production.

```js
import { createEnvironments } from '@stacknodo/sdk';

const envs = createEnvironments({
  projectId: 'proj_store_123',
  apiKey: process.env.STACKNODO_API_KEY,
});

const stagingProducts = await envs.staging.from('products').limit(5);
const productionProducts = await envs.production.from('products').limit(5);

console.log({ stagingProducts, productionProducts });
```

## Query Builder: `client.from(tableName)`

Use `client.from('tableName')` for normal CRUD and filter-based reads.

```js
const orders = await client.from('orders')
  .select('customerName', 'total', 'paid')
  .eq('paid', false)
  .order('createdAt', 'desc')
  .limit(10);
```

### `select(...fields)`

Limit the response to specific fields. Call `select()` with no arguments if you want the server default set of visible fields.

Simple real-life example: show only the customer-facing columns on an order list.

```js
const orders = await client.from('orders')
  .select('customerName', 'total', 'paid')
  .limit(20);
```

### `eq(field, value)`

Match exact values.

Simple real-life example: find only unpaid invoices.

```js
const unpaidInvoices = await client.from('invoices')
  .eq('paid', false)
  .limit(20);
```

### `neq(field, value)`

Match records where the field is not equal to the given value.

Simple real-life example: hide cancelled bookings.

```js
const activeBookings = await client.from('bookings')
  .neq('status', 'cancelled')
  .limit(20);
```

### `gt(field, value)`

Match values greater than the given value.

Simple real-life example: find products that still have stock.

```js
const inStock = await client.from('products')
  .gt('stock', 0)
  .limit(20);
```

### `gte(field, value)`

Match values greater than or equal to the given value.

Simple real-life example: show loyalty members with at least 100 points.

```js
const rewardMembers = await client.from('customers')
  .gte('points', 100)
  .limit(20);
```

### `lt(field, value)`

Match values less than the given value.

Simple real-life example: find soon-to-expire coupons by remaining uses.

```js
const lowUseCoupons = await client.from('coupons')
  .lt('remainingUses', 5)
  .limit(20);
```

### `lte(field, value)`

Match values less than or equal to the given value.

Simple real-life example: find tasks due today or earlier.

```js
const overdueTasks = await client.from('tasks')
  .lte('dueAt', new Date().toISOString())
  .limit(20);
```

### `in(field, values)`

Match values contained in an array.

Simple real-life example: fetch only orders that are new, packed, or shipped.

```js
const activeOrders = await client.from('orders')
  .in('status', ['new', 'packed', 'shipped'])
  .limit(20);
```

### `contains(field, value)`

Text search helper for substring matching.

Simple real-life example: search customer names by partial input.

```js
const matchingCustomers = await client.from('customers')
  .contains('name', 'anna')
  .limit(10);
```

### `order(field, dir)`

Sort results by a field. `dir` can be `asc` or `desc`.

Simple real-life example: show newest support tickets first.

```js
const tickets = await client.from('tickets')
  .order('createdAt', 'desc')
  .limit(20);
```

### `limit(n)`

Limit how many records come back.

Simple real-life example: show the five newest announcements on a homepage.

```js
const announcements = await client.from('announcements')
  .order('createdAt', 'desc')
  .limit(5);
```

### `offset(n)`

Skip records for simple pagination.

Simple real-life example: fetch page 3 of a 20-row admin table.

```js
const pageSize = 20;
const page = 3;

const users = await client.from('users')
  .order('createdAt', 'desc')
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

### `expand(...relations)`

Ask the API to expand related records.

Simple real-life example: load blog posts together with their author relation.

```js
const posts = await client.from('posts')
  .select('title', 'authorId')
  .expand('author')
  .limit(10);
```

### `get(id)`

Fetch one record by ID.

Simple real-life example: open a single order details page.

```js
const order = await client.from('orders').get('order_123');
```

### `create(data)`

Insert a new record.

Simple real-life example: create a support ticket.

```js
const ticket = await client.from('tickets').create({
  subject: 'Printer is offline',
  priority: 'medium',
  status: 'open',
});
```

### `update(id, data)`

Patch an existing record by ID.

Simple real-life example: mark a ticket as resolved.

```js
const updatedTicket = await client.from('tickets').update('ticket_123', {
  status: 'resolved',
});
```

### `delete(id)`

Delete a record by ID.

Simple real-life example: remove a draft announcement that should never go live.

```js
await client.from('announcements').delete('announcement_123');
```

### Building queries conditionally

This is useful when you only want to apply filters if the user filled out a form.

```js
let query = client.from('products').select('name', 'price', 'category');

if (process.env.CATEGORY) {
  query = query.eq('category', process.env.CATEGORY);
}

if (process.env.MIN_PRICE) {
  query = query.gte('price', Number(process.env.MIN_PRICE));
}

const results = await query.order('name', 'asc').limit(50);
```

## File Storage: `client.storage`

Use the storage namespace for file upload, download, and deletion. Query file metadata with the normal query builder.

```js
const recentFiles = await client.from('media')
  .select('filename', 'contentType', 'size')
  .order('createdAt', 'desc')
  .limit(10);
```

### `client.storage.from(tableName)`

Scope storage operations to a file storage table.

Simple real-life example: use the `avatars` file table for profile pictures.

```js
const avatars = client.storage.from('avatars');
```

### `upload(file, { filename, contentType })`

Upload a new file.

Simple real-life example: store a customer contract PDF.

```js
import { readFile } from 'node:fs/promises';

const pdf = await readFile('./contract.pdf');

const storedFile = await client.storage.from('documents').upload(pdf, {
  filename: 'contract.pdf',
  contentType: 'application/pdf',
});

console.log(storedFile);
```

### `getUrl(fileId)`

Build the direct Stacknodo file URL for a stored file.

Simple real-life example: save a profile-photo URL to send to another backend service.

```js
const avatarUrl = await client.storage.from('avatars').getUrl('file_123');
console.log(avatarUrl);
```

### `download(fileId)`

Download a file as a streaming `Response`.

This is the better choice for large files or when you want to proxy a download without buffering the whole file in memory.

Simple real-life example: proxy a receipt download from your own server.

```js
const response = await client.storage.from('receipts').download('file_123');
const receiptBytes = Buffer.from(await response.arrayBuffer());
```

### `downloadBuffer(fileId)`

Download a file directly into a Node.js `Buffer`.

This is usually the better choice for smaller files or short-lived scripts that need the full file in memory right away.

Simple real-life example: attach a stored PDF to an email job.

```js
const invoiceBuffer = await client.storage.from('invoices').downloadBuffer('file_123');
console.log(invoiceBuffer.length);
```

If you have logged in through `client.dataAuth`, storage operations use that database-user session automatically. Otherwise they continue using your project or organisation API key.

### `delete(fileId)`

Delete a stored file.

Simple real-life example: remove an unused brochure.

```js
await client.storage.from('brochures').delete('file_123');
```

## Platform Member Auth: `client.platformAuth`

Use this namespace when you want to act as a real Stacknodo member.

### `login({ email, username, password })`

Create a platform session.

Simple real-life example: sign in as an internal operator before calling member-only platform endpoints.

```js
const session = await client.platformAuth.login({
  email: 'owner@example.com',
  password: 'correct horse battery staple',
});

console.log(session.accessToken);
console.log(session.user);
```

### `getUser()`

Fetch the current Stacknodo member profile.

Simple real-life example: show which operator is running an admin script.

```js
const me = await client.platformAuth.getUser();
console.log(me);
```

### `refresh()`

Refresh the current platform session manually.

In normal SDK usage you rarely need this, because the HTTP client refreshes stored sessions automatically.

```js
const refreshed = await client.platformAuth.refresh();
console.log(refreshed.accessToken);
```

### `logout()`

Revoke the current platform session and clear local state.

Simple real-life example: sign out at the end of a maintenance script.

```js
await client.platformAuth.logout();
```

## Database User Auth: `client.dataAuth`

Use this namespace for your app's end users. Once logged in, normal data and storage calls automatically use the database-user session, and the SDK refreshes that session for you when it can.

Comfort functions included here:

- `register()` to create a user and start a session
- `login()` to start a user session
- `getUser()` to fetch the current signed-in user
- `refresh()` if you want to refresh manually
- `logout()` to revoke the session and clear local state

### `register(payload)`

Register a new database user.

This also stores the returned session so your next normal data or storage request can run as that user immediately.

Simple real-life example: sign up a customer in a shopping app.

```js
const session = await client.dataAuth.register({
  email: 'mia@example.com',
  password: 'SuperSecret123',
  name: 'Mia',
});

console.log(session.user);
```

### `login({ email, password })`

Sign in an existing database user.

This is the main comfort entrypoint for app sessions: it stores the returned tokens, switches subsequent data and storage calls to the signed-in user automatically, and lets the SDK refresh access tokens when needed.

Simple real-life example: start a customer session before loading that user's orders.

```js
await client.dataAuth.login({
  email: 'mia@example.com',
  password: 'SuperSecret123',
});

const myOrders = await client.from('orders').order('createdAt', 'desc').limit(10);
```

### `getUser()`

Fetch the currently logged-in database user.

Use this when you need the current signed-in user's profile without manually decoding tokens or making your own auth request.

Simple real-life example: load the signed-in customer's account row.

```js
const currentCustomer = await client.dataAuth.getUser();
console.log(currentCustomer);
```

### `refresh()`

Refresh the current database-user session manually.

The SDK already refreshes stored data sessions when needed, so this is mainly useful if you want to inspect or persist the latest tokens yourself.

```js
const refreshed = await client.dataAuth.refresh();
console.log(refreshed.refreshToken);
```

### `logout()`

Revoke the current database-user session and clear it locally.

Use this when you want the SDK to stop sending the signed-in user token and go back to non-user auth flows for subsequent requests.

Simple real-life example: sign the user out before ending a server session.

```js
await client.dataAuth.logout();
```

## AI Agent API: `client.ai`

Use the AI namespace for stateless queries or server-managed conversations.

Supported tiers:

- `fast`
- `balanced`
- `powerful`

### `query(question, options)`

Run a one-off AI query.

Simple real-life example: summarize customer feedback stored in your project.

```js
const answer = await client.ai.query('Summarize the last week of support feedback', {
  tier: 'balanced',
});

console.log(answer.text);
```

You can also attach custom context or files:

```js
const answer = await client.ai.query('Summarize this contract in plain English', {
  tier: 'powerful',
  files: ['file_contract_123'],
  fileTable: 'documents',
  context: [
    { type: 'text', content: 'The reader is not a lawyer.' },
  ],
});
```

### `query(question, { stream: true })`

Stream AI output as an async iterable.

Simple real-life example: stream a long answer into a CLI.

```js
const stream = await client.ai.query('Write a friendly onboarding email for a new customer', {
  tier: 'balanced',
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.text || '');
}
```

### `client.ai.conversations.create(options)`

Create a server-managed conversation.

Simple real-life example: start a support assistant chat session.

```js
const conversation = await client.ai.conversations.create({
  tier: 'balanced',
  systemPrompt: 'You are a polite support assistant for a bike shop.',
});
```

### `client.ai.conversations.send(conversationId, message, options)`

Send a message to an existing conversation.

Simple real-life example: ask a follow-up question in the same support chat.

```js
const reply = await client.ai.conversations.send(conversation.id, 'Do you sell helmets for kids?');
console.log(reply.text);
```

Streaming works here too:

```js
const replyStream = await client.ai.conversations.send(conversation.id, 'List three beginner bikes', {
  stream: true,
});

for await (const chunk of replyStream) {
  process.stdout.write(chunk.text || '');
}
```

### `client.ai.conversations.list()`

List stored conversations.

Simple real-life example: show the last few internal AI sessions in an admin panel.

```js
const conversations = await client.ai.conversations.list();
console.log(conversations);
```

### `client.ai.conversations.delete(conversationId)`

Delete a conversation.

Simple real-life example: clean up a finished temporary chat.

```js
await client.ai.conversations.delete(conversation.id);
```

## Custom Functions: `client.functions`

Use this namespace to call project-scoped runtime endpoints.

### `invoke(functionPath, { body, method })`

Invoke a function route.

Simple real-life example: trigger a custom `sync-orders` function after importing orders from a marketplace.

```js
const result = await client.functions.invoke('sync-orders', {
  method: 'POST',
  body: { source: 'shopify', dryRun: false },
});

console.log(result);
```

## Real-Time: `client.realtime`

Use this namespace to subscribe to table changes over WebSocket.

### `connect()`

Open the WebSocket connection explicitly.

You usually do not need to call this first because `subscribe()` auto-connects, but it can be useful if you want to fail early.

```js
await client.realtime.connect();
```

### `subscribe(table, event, callback)`

Subscribe to record events. Returns an object with `unsubscribe()`.

Simple real-life example: update a dashboard whenever new orders arrive.

```js
const subscription = client.realtime.subscribe('orders', 'record.created', (event) => {
  console.log('New order:', event.record);
});

// Later:
subscription.unsubscribe();
```

Subscribe to every change on a table:

```js
const allTicketEvents = client.realtime.subscribe('tickets', '*', (event) => {
  console.log(event.type, event.record);
});
```

### `disconnect()`

Close the WebSocket connection and remove all subscriptions.

Simple real-life example: stop listening before a worker shuts down.

```js
client.realtime.disconnect();
```

## Admin API: `client.admin`

The admin namespace is for project and schema management. Use an organisation API key when you want the broadest admin access.

### Schema: `client.admin.schema`

#### `listTables()`

List tables for the current environment database.

Simple real-life example: inspect the current schema before a migration.

```js
const tables = await client.admin.schema.listTables();
console.log(tables);
```

#### `createTable(name, { fields, rls })`

Create a table.

Simple real-life example: add a `leads` table for a sales team.

```js
await client.admin.schema.createTable('leads', {
  fields: {
    companyName: 'string',
    contactEmail: 'string',
    qualified: 'boolean',
  },
});
```

#### `addField(tableName, fieldName, fieldType)`

Add one field to an existing table.

Simple real-life example: add a `phoneNumber` field to customers.

```js
await client.admin.schema.addField('customers', 'phoneNumber', 'string');
```

#### `deleteTable(tableId)`

Delete a table by its internal table ID.

Simple real-life example: remove a short-lived staging table after a test.

```js
const tables = await client.admin.schema.listTables();
const tempTable = tables.find((table) => table.name === 'temp_imports');

if (tempTable) {
  await client.admin.schema.deleteTable(tempTable.id || tempTable._id);
}
```

#### `deleteField(tableName, fieldName)`

Remove one field from an existing table.

Simple real-life example: remove an old `faxNumber` field nobody uses anymore.

```js
await client.admin.schema.deleteField('customers', 'faxNumber');
```

#### `promote()`

Trigger project promotion to the next environment.

Simple real-life example: promote a tested staging schema forward.

```js
const promotion = await client.admin.schema.promote();
console.log(promotion);
```

### Snapshots: `client.admin.snapshots`

#### `create({ name })`

Create a snapshot.

Simple real-life example: make a backup before a risky migration.

```js
await client.admin.snapshots.create({ name: 'Before pricing migration' });
```

#### `list()`

List snapshots.

Simple real-life example: show available restore points.

```js
const snapshots = await client.admin.snapshots.list();
console.log(snapshots);
```

#### `restore(snapshotId)`

Restore a snapshot.

Simple real-life example: roll back test data after a failed import.

```js
await client.admin.snapshots.restore('snapshot_123');
```

#### `delete(snapshotId)`

Delete a snapshot.

Simple real-life example: clean up an old temporary backup.

```js
await client.admin.snapshots.delete('snapshot_123');
```

### Projects: `client.admin.projects`

#### `list()`

List projects visible to the current admin token.

Simple real-life example: show every project in an internal admin script.

```js
const projects = await client.admin.projects.list();
console.log(projects);
```

#### `create({ name })`

Create a project.

Simple real-life example: bootstrap a new client workspace.

```js
const project = await client.admin.projects.create({
  name: 'Northwind CRM',
});

console.log(project);
```

#### `update(projectId, data)`

Update project metadata.

Simple real-life example: rename a project after a rebrand.

```js
await client.admin.projects.update('proj_123', {
  name: 'Northwind Sales Platform',
});
```

### Environments: `client.admin.environments`

#### `list()`

List environments for the current project.

Simple real-life example: verify whether staging already exists before a deployment step.

```js
const environments = await client.admin.environments.list();
console.log(environments);
```

#### `add(environment)`

Add an environment to the current project.

Simple real-life example: create a development environment for a new feature team.

```js
await client.admin.environments.add('development');
```

### Organisation: `client.admin.org`

#### `get()`

Fetch the current organisation.

Simple real-life example: print the organisation name in an admin dashboard startup script.

```js
const org = await client.admin.org.get();
console.log(org);
```

#### `usage()`

Fetch billing and usage information.

Simple real-life example: warn when the team is close to a plan limit.

```js
const usage = await client.admin.org.usage();
console.log(usage);
```

## Error Handling

All SDK request failures throw `StacknodoError`.

```js
import { StacknodoError } from '@stacknodo/sdk';

try {
  await client.from('orders').get('missing_order');
} catch (error) {
  if (error instanceof StacknodoError) {
    console.error(error.message);
    console.error(error.status);
    console.error(error.code);
    console.error(error.details);
  } else {
    throw error;
  }
}
```

### Common error codes

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid input |
| `401` | `UNAUTHORIZED` | Missing or invalid auth |
| `403` | `FORBIDDEN` | RLS or permission check denied access |
| `404` | `NOT_FOUND` | Record or resource not found |
| `409` | `CONFLICT` | Duplicate key or version conflict |
| `429` | `RATE_LIMITED` | Too many requests |
| `429` | `upgrade_required` | Plan or quota limit exceeded |
| `0` | `TIMEOUT` | Request timed out |
| `0` | `NETWORK_ERROR` | DNS, connection, or transport error |

### Timeout configuration

Set `timeout` when constructing the client to control how long requests can run before the SDK aborts them.

```js
const client = new Stacknodo({
  projectId: 'proj_abc123',
  apiKey: process.env.STACKNODO_API_KEY,
  timeout: 10000,
});
```

### Simple retry wrapper

For transient server-side failures, a small retry wrapper is often enough.

```js
async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status >= 500 && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

const posts = await withRetry(() => client.from('posts').limit(10));
```

## Requirements

- Node.js 18+
- native `fetch`
- the realtime client falls back to the bundled `ws` package automatically when `WebSocket` is not globally available

## CLI Commands

The package exposes a `stacknodo` CLI.

### `npx stacknodo agent install`

Copy the bundled agent skill entrypoint into the current project root.

```bash
npx stacknodo agent install
```

### `npx stacknodo agent install --force`

Overwrite an existing installed skill directory.

```bash
npx stacknodo agent install --force
```

### `npx stacknodo agent install --dest <path>`

Install the skill entrypoint into a different destination root.

```bash
npx stacknodo agent install --dest apps/api
```

### `npx stacknodo agent path`

Print the bundled source path inside the installed package.

```bash
npx stacknodo agent path
```

## Public Exports

The package exports:

- `Stacknodo`
- `createEnvironments`
- `StacknodoError`
- `QueryBuilder`
- `PlatformAuthClient`
- `DataAuthClient`
- `AuthClient` (alias of `PlatformAuthClient`)

Most application code only needs `Stacknodo` and `StacknodoError`.

## Official Stacknodo Docs

This README focuses on the JavaScript SDK surface shipped in this repository. For platform-level concepts such as RLS, file storage modeling, API keys, environments, AI quotas, and project setup, use the official docs:

- Full docs feed: https://docs.stacknodo.com/api/docs.md
- Main docs site: https://docs.stacknodo.com/

## License

MIT
