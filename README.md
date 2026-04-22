# Stacknodo JavaScript SDK

Official JavaScript SDK for Stacknodo.

## Install

```bash
npm install @stacknodo/sdk
```

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

## Agent Skills

After installing the SDK, copy the bundled agent skill entrypoint into your project root:

```bash
npx stacknodo agent install
```

That creates `.agents/skills/stacknodo-sdk/` in the current project.

## Docs

- SDK docs: https://docs.stacknodo.com/#sdk
- Agent guide: https://docs.stacknodo.com/#agent-skills