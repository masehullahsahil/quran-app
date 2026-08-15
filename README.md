# Quran Reading Experience

A full-stack Quran reading app: a React 19 client served by an Express server,
with a tRPC API, Drizzle ORM over MySQL, and OAuth sign-in. Recitation feedback
is powered by an audio transcription API.

**Stack:** React 19 · Vite 7 · TypeScript · Tailwind CSS 4 · Radix UI · tRPC 11 ·
TanStack Query · Express 4 · Drizzle ORM (MySQL) · Vitest

---

## Prerequisites

| Requirement | Version | Notes                                                        |
| ----------- | ------- | ------------------------------------------------------------ |
| **Node.js** | 20+     | Developed and verified on v22.                               |
| **pnpm**    | 10.4.1  | Pinned via `packageManager` in `package.json`.               |
| **MySQL**   | 8+      | Optional for local dev — see [Database](#database-optional). |

The repo pins pnpm, so the easiest path is to let Corepack manage it:

```bash
corepack enable
```

That makes `pnpm` in this directory resolve to the pinned version automatically.
If you'd rather install it globally, use `npm install -g pnpm@10.4.1` — other
major versions may resolve the lockfile differently.

---

## Install

```bash
git clone https://github.com/masehullahsahil/quran-app.git
cd quran-app
pnpm install
```

pnpm 10 blocks dependency build scripts by default, so the install prints:

```
Ignored build scripts: @tailwindcss/oxide, esbuild.
```

This is expected and the build works regardless, since both packages ship
prebuilt binaries for common platforms. If you hit a Tailwind or esbuild binary
error on your machine, approve them once with:

```bash
pnpm approve-builds
```

---

## Environment setup

Copy the example file and fill in what you need:

```bash
cp .env.example .env
```

One `.env` at the repo root covers both halves of the app — the server loads it
through `dotenv` at startup, and Vite reads the same file at build time for the
`VITE_`-prefixed values.

**You can skip this entirely to start.** Every variable is optional for booting:
`pnpm dev` starts and serves the UI with no `.env` present. Each variable gates
one feature, and the app degrades cleanly without it (the server logs a warning
about `OAUTH_SERVER_URL` on startup — harmless until you want sign-in).

Fill things in as you need the features they unlock:

| Want to…                                                      | Set                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Persist users                                                 | `DATABASE_URL`                                                           |
| Enable sign-in                                                | `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` |
| Grant yourself admin                                          | `OWNER_OPEN_ID`                                                          |
| Transcribe recitations and generate coaching feedback         | `OPENAI_API_KEY`                                                         |
| Image generation, uploads, notifications                      | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`                       |
| Render maps                                                   | `VITE_FRONTEND_FORGE_API_KEY`                                            |
| Collect analytics                                             | `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID`                   |

`.env.example` documents every variable individually, including what breaks when
it is missing. Two things worth knowing up front:

- **`VITE_`-prefixed values are public.** They are inlined into the client bundle
  at build time and visible to anyone who loads the page. Never put a private
  secret behind a `VITE_` name — `OPENAI_API_KEY` and `BUILT_IN_FORGE_API_KEY`
  in particular are server-side only.
- **If you leave the analytics variables blank,** their placeholders are emitted
  into the built HTML verbatim and the production page requests a broken script
  URL. Either set both, or delete the analytics `<script>` from
  `client/index.html`.

### Database (optional)

Without `DATABASE_URL` the app runs fine — it connects lazily, and user writes
log a warning and no-op rather than failing. Once you do point it at a MySQL
instance, apply the schema:

```bash
pnpm db:push    # drizzle-kit generate && drizzle-kit migrate
```

This command _requires_ `DATABASE_URL` and exits immediately without it.

---

## Run the dev server

```bash
pnpm dev
```

This starts the Express server with `tsx watch` and mounts Vite as middleware,
so the API and the client are served from one origin with HMR — open
**http://localhost:3000**.

Both the server and the client reload on save. Set `PORT` to use a different
port; if the port is taken, the server scans upward and logs the one it actually
bound to.

---

## Available scripts

| Command        | What it does                                                                  |
| -------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`     | Dev server with HMR on port 3000.                                             |
| `pnpm build`   | Builds the client with Vite and bundles the server with esbuild into `dist/`. |
| `pnpm start`   | Runs the production build (`pnpm build` first).                               |
| `pnpm check`   | TypeScript type check, no emit.                                               |
| `pnpm test`    | Runs the Vitest suite once.                                                   |
| `pnpm format`  | Formats the repo with Prettier.                                               |
| `pnpm db:push` | Generates and applies Drizzle migrations.                                     |

There are also two manual smoke tests in `scripts/`, run with `node`. They hit
live services rather than mocks, so they are deliberately outside `pnpm test`:

```bash
node scripts/recitation-smoke-test.mjs   # needs RECITATION_TEST_APP_URL + a running app
node scripts/audio-llm-smoke-test.mjs    # needs BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY
```

---

## Project layout

```
client/          React app (Vite root)
  src/pages/       Route components
  src/components/  UI components, incl. shadcn/ui primitives
  src/lib/         Client helpers
server/          Express + tRPC backend
  _core/           Server bootstrap, OAuth, storage, AI integrations
  routers.ts       tRPC router definitions
  db.ts            Drizzle queries
shared/          Types and constants shared across client and server
drizzle/         Schema and migrations
scripts/         Manual smoke tests
```

Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`.

---

## License

MIT
