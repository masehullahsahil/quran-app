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

Windows, macOS, and Linux are all supported. The scripts that need an
environment variable set them through [`cross-env`](https://www.npmjs.com/package/cross-env),
so `pnpm dev` and `pnpm start` work the same in PowerShell, cmd, and POSIX
shells — no WSL or Git Bash required.

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
| Read the Quran from a mirror instead of `api.quran.com`       | `QURAN_API_BASE_URL`                                                     |
| Image generation, uploads, notifications, archiving attempts  | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`                       |
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

### Quran content

The Quran text, translations, and reciter audio come from the public
[Quran.com API](https://api.quran.com/api/v4) (`api.quran.com`). It needs no
key and no configuration — the reader works out of the box, provided the server
can reach that host.

Set `QURAN_API_BASE_URL` only to point at a mirror, or at a local fixture server
when `api.quran.com` is unreachable from your network. See
[Quran content pipeline](#quran-content-pipeline) for how the data is fetched
and cached.

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

`dev` and `start` prefix their command with `cross-env` to set `NODE_ENV`
(`development` and `production` respectively). Keep that prefix when editing
them — a bare `NODE_ENV=... <command>` is POSIX shell syntax and fails in
PowerShell and cmd. Any new script that needs an inline environment variable
should use `cross-env` too.

There are also two manual smoke tests in `scripts/`, run with `node`. They hit
live services rather than mocks, so they are deliberately outside `pnpm test`:

```bash
node scripts/recitation-smoke-test.mjs   # needs RECITATION_TEST_APP_URL + a running app
node scripts/audio-llm-smoke-test.mjs    # needs BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY
```

---

## Quran content pipeline

The reader covers the whole Quran — 114 surahs, 30 juz, per-ayah audio from
three reciters — and none of it is bundled with the app. It is fetched from the
Quran.com API through the server, never from the browser directly.

```
client/src/pages/Home.tsx      selection: surah, juz, reciter, ayah
        │  trpc quran.index / quran.surah
server/routers.ts              request validation, error mapping
        │
server/quranApi.ts             the only file that knows Quran.com's field names
        │  TtlCache
server/quranCache.ts           24h TTL, single-flight, LRU eviction
        │
api.quran.com/api/v4
```

Two procedures serve the reader:

| Procedure      | Returns                                                              |
| -------------- | -------------------------------------------------------------------- |
| `quran.index`  | All 114 surahs, the 30 juz, and the reciter list — one call on load. |
| `quran.surah`  | One surah's ayahs: Arabic, translation, transliteration, audio URL.  |

### Caching

Every upstream response passes through the TTL cache in `server/quranCache.ts`:

- **24-hour TTL.** The text does not change; the TTL exists to pick up
  translation corrections and to bound memory, not to revalidate.
- **Single-flight.** Al-Baqarah is six upstream pages (the API caps `per_page`
  at 50). Concurrent readers opening it share one fetch chain instead of
  starting one each.
- **Text and audio are cached separately,** keyed by surah and by
  surah + reciter. Switching reciter refetches audio only; the text is reused.
- **Failures are not cached,** so a transient upstream error is retried by the
  next reader rather than pinned for the day.

On the client both queries are held with `staleTime: Infinity`, so paging back
to a surah already read in the session costs no request at all.

### Reciters

The picker offers Alafasy, Husary, and Minshawi. Each is resolved by matching
the reciter's name against `/resources/recitations` at runtime, preferring the
murattal reading, and falling back to a known recitation id if that list is
unavailable. Matching by name rather than trusting a hardcoded id means an
upstream renumbering cannot silently swap one reciter's audio for another's.

### Degradation

The Arabic text is the point of the app, so it is the last thing to be given up:

- Audio missing for a reciter → the ayah still renders, and the reader is told
  to try another reciter.
- Translation or transliteration missing → that line is hidden, nothing else
  changes.
- Quran.com unreachable → the reading area shows the reason and a retry
  control rather than an empty page.

---

## Letter recitation audio (Learn · Starter)

The Starter level plays each Arabic letter — alone and carrying fatha, kasra, or
damma — from recordings by a qualified reciter.

**It does not use speech synthesis, and must not.** An English voice has no
phoneme for ح ع ص ض ط ظ ق غ, so it does not approximate those letters, it says a
different sound ("Taa" came out as "Te AA"). English explanations of
articulation are still spoken; Arabic never is.

The playback path is in place and the recordings are not yet — until a file
exists the control says the recording is unavailable, which is the intended
behaviour rather than a bug.

### Adding recordings

Drop `.mp3` files into `client/public/audio/letters/`. No code change is needed.

```
{slug}.mp3          alif.mp3          the letter alone
{slug}-fatha.mp3    alif-fatha.mp3    with fatha  َ
{slug}-kasra.mp3    alif-kasra.mp3    with kasra  ِ
{slug}-damma.mp3    alif-damma.mp3    with damma  ُ
```

28 letters × 4 = 112 files. Slugs are an explicit field in
`client/src/lib/arabicLetters.ts` rather than derived from the display name,
because the names collide: ت and ط are both written "Taa", ح and ه both "Haa".

| Where | What |
| ----- | ---- |
| `docs/letter-recordings.md` | The checklist to hand to the reciter — all 112 files, with recording guidance. |
| `client/public/audio/letters/README.md` | The naming convention, next to where the files go. |
| `client/src/lib/arabicLetters.ts` | The letter table and path helpers — the source of truth. |
| `client/src/hooks/useLetterAudio.ts` | Playback, and the missing-recording state. |

`docs/letter-recordings.md` is generated. After changing the letter table, run:

```bash
node scripts/generate-letter-recording-list.mjs
```

A test fails if the committed list and the paths the app requests disagree, so
the reciter is never handed a filename the app will not look for.

---

## Project layout

```
client/          React app (Vite root)
  src/pages/       Route components
  src/components/  UI components, incl. shadcn/ui primitives
  src/hooks/       Client hooks, incl. letter audio playback
  src/lib/         Client helpers, incl. the Arabic letter table
  public/audio/    Reciter recordings served as static assets
server/          Express + tRPC backend
  _core/           Server bootstrap, OAuth, storage, AI integrations
  routers.ts       tRPC router definitions
  quranApi.ts      Quran.com API client (surahs, juz, verses, audio)
  quranCache.ts    TTL cache in front of Quran.com
  recitation.ts    Word-recall alignment for recorded attempts
  db.ts            Drizzle queries
shared/          Types and constants shared across client and server
drizzle/         Schema and migrations
scripts/         Manual smoke tests and generators
```

Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`.

---

## License

MIT
