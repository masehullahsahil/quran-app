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
| `pnpm build:client` | Client only. Used by Vercel, where the function is built from `api/`.    |
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

## Deploying to Vercel

The app runs on Vercel as one serverless function plus static files on the CDN.
`api/index.ts` exports the Express app built by `server/_core/app.ts`; the
client build in `dist/public` is served directly by the CDN and never passes
through the function.

```
CDN            dist/public — index.html, /assets, /audio
function       /api/trpc/*, /api/oauth/*, /manus-storage/*   (api/index.ts)
```

`server/_core/index.ts` is untouched by this: it is still the long-running
server for `pnpm dev` and `pnpm start`, and it is the only entry that binds a
port or mounts the Vite dev middleware.

### First deploy

1. Import the repository in Vercel. `vercel.json` sets the build command
   (`pnpm build:client`), the output directory, the routes, and the function's
   `maxDuration` — no dashboard configuration is needed.
2. Add the environment variables below under **Settings → Environment
   Variables**.
3. Deploy.

### Environment variables

Nothing is required to get a working reader — the Quran text, navigation, and
recitation audio come from the public Quran.com API, which needs no key.

| Variable | Needed for | If unset |
| -------- | ---------- | -------- |
| `OPENAI_API_KEY` | Recitation review (Whisper + coaching), and generating the letter clips | Recording still works; the review returns an error. Letter clips cannot be generated, but committed ones keep playing |
| `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` | Sign-in | Sign-in unavailable; a startup warning is logged. Everything else works |
| `DATABASE_URL` | Persisting users | User writes log a warning and no-op |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Archiving recitation attempts, uploads | Attempts are reviewed but not archived |
| `QURAN_API_BASE_URL` | Pointing at a mirror | Defaults to `api.quran.com` — leave unset |

Two things specific to Vercel:

- **`VITE_`-prefixed variables are read at build time,** not at request time.
  Set them before the build that should contain them, and remember they are
  inlined into the client bundle and therefore public.
- **The analytics placeholders ship verbatim if unset.** `client/index.html`
  contains `src="%VITE_ANALYTICS_ENDPOINT%/umami"`, and Vite leaves the
  placeholder in place when the variable is missing, so the deployed page
  requests a broken script URL on every load. Either set
  `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID`, or delete that
  `<script>` line from `client/index.html`.

### What the platform constrains

- **Request bodies are capped at ~4.5 MB**, and Vercel rejects an oversized body
  before the function runs. The recitation cap is set from that ceiling rather
  than from Whisper's — see [Recitation limits](#recitation-limits).
- **Functions are capped at 60s on the Hobby plan**, which `vercel.json` sets
  explicitly. The review path is two sequential calls (transcription, then the
  coaching summary) and typically completes in well under ten seconds.
- **The Quran cache is per instance.** `server/quranCache.ts` lives in memory,
  so each warm function instance keeps its own copy and a cold start begins
  empty. Correctness is unaffected — failures are still not cached, and
  single-flight still collapses concurrent misses within an instance — but
  Quran.com sees more traffic than it would from a single long-running server.

---

## Recitation limits

A recitation attempt is sent as base64 inside a JSON body, which makes the
request about a third larger than the recording. `shared/recording.ts` holds the
numbers so the recorder and the review endpoint enforce the same cap:

| | |
| --- | --- |
| Largest recording | 3 MB (roughly five minutes of MediaRecorder's Opus) |
| Encoded request at that size | ~4.2 MB |
| Platform limit | 4.5 MB |

The check runs **in the browser, before encoding**. That is deliberate: a
serverless host rejects an oversized body before any of our code executes, so a
server-side check alone would leave the learner with an opaque failure. Going
over the cap shows a sentence naming the actual size, and nothing is uploaded.
The server keeps the same limit as a backstop for clients that skip the check.

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

| Procedure      | Returns                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| `quran.index`  | All 114 surahs, the 30 juz, the reciter list, and every translation the API offers. |
| `quran.surah`  | One surah's ayahs: Arabic, translation, transliteration, audio URL.               |

### Caching

Every upstream response passes through the TTL cache in `server/quranCache.ts`:

- **24-hour TTL.** The text does not change; the TTL exists to pick up
  translation corrections and to bound memory, not to revalidate.
- **Single-flight.** Al-Baqarah is six upstream pages (the API caps `per_page`
  at 50). Concurrent readers opening it share one fetch chain instead of
  starting one each.
- **Text and audio are cached separately,** keyed by surah + translation and by
  surah + reciter. Switching reciter refetches audio only; switching translation
  refetches text only. The Arabic is identical either way, but the text beneath
  it is not, so the two cannot share an entry.
- **Failures are not cached,** so a transient upstream error is retried by the
  next reader rather than pinned for the day.

On the client both queries are held with `staleTime: Infinity`, so paging back
to a surah already read in the session costs no request at all.

### Translations

The translation picker is built from `/resources/translations` rather than a
list in the code, so a language Quran.com adds appears on its own — nothing here
names English, Urdu, Pashto, or Dari. Options are grouped by language, and the
instruction pack's `preferredTranslationLanguage` only sorts its own language to
the top; it never filters what is on offer.

The Latin transliteration is excluded from the choices: it is shown alongside
whatever translation is selected rather than being one of them.

Surah names come from the same `/chapters` response the picker already used —
`name_arabic` is rendered in Amiri with the transliteration beneath it, in both
the picker and the current-surah heading.

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
- Translation list unavailable → the picker is empty and the reader falls back
  to the default English translation; the Quran still loads.
- Quran.com unreachable → the reading area shows the reason and a retry
  control rather than an empty page.

---

## Instruction languages

The language a learner is *taught in* is separate from the Quran itself. Each
language is a self-contained pack under `locales/`:

```
locales/
  types.ts       the pack shape
  index.ts       registry, loader, per-key fallback
  en/index.ts    reference pack — every key defined here
  ur/index.ts    one of four complete packs (ps, fa-AF, ur, ar)
```

A pack holds UI strings, lesson explanation text, and a path to spoken
instruction audio in that language. **It never holds Quranic content.** The
Arabic text comes from the Quran.com API and the Arabic letter recordings from
`client/public/audio/letters/` — one shared set for every language. A test
asserts no pack string contains Arabic script, so scripture cannot drift into
the instruction layer.

**Fallback is per key, not per pack.** A language with three strings translated
shows those three and English everywhere else, so it is usable from its first
translated line instead of being gated on completeness. Empty strings count as
missing, so a half-filled key never renders as a blank label.

English is bundled, because it is the fallback and must be present before any
other language can render; every other pack is a dynamic `import()` and costs
nothing until selected. The learner's choice is remembered in `localStorage`,
and the pack's `direction` is applied to `<html dir>` — Quranic Arabic sets its
own direction regardless.

To add a language, see [`locales/README.md`](locales/README.md). The key list to
translate from is generated:

```bash
node scripts/scaffold-locale.mjs <code> --full   # every key with its English text
node scripts/scaffold-locale.mjs <code>          # only what is still missing
```

---

## Letter recitation audio (Learn · Starter)

The Starter level plays each Arabic letter — alone and carrying fatha, kasra, or
damma — from audio files, one per form, 112 in all.

**Arabic is never read by an English voice, and must not be.** An English voice
has no phoneme for ح ع ص ض ط ظ ق غ, so it does not approximate those letters, it
says a different sound — the browser's speech synthesis pronounced "Taa" as
"Te AA", which is why it was removed. English explanations of articulation are
still spoken; English is never pointed at Arabic.

That rule is about which language a voice is reading, not about whether a human
made the recording. Every clip is currently generated by an Arabic-reading
text-to-speech voice from Arabic text — a stopgap until a hafiz records the set,
disclosed to the learner as synthesised — and no clip is ever an English voice
sounding out a transliteration.

Until a file exists the control says so and plays nothing, which is the intended
behaviour rather than a bug.

### Generated audio (temporary)

A hafiz's recordings do not exist yet, so the 112 clips are currently
**generated once with OpenAI's text-to-speech API** and committed as static
files. Nothing calls the API at playback time — the cost is 112 requests, once,
not one per learner. The learner is told the voice is synthesised, and the app
credits it rather than crediting a reciter.

Each clip is generated from the **Arabic text**, never a transliteration:

| Clip | Text sent |
| ---- | --------- |
| `alif.mp3` | `أَلِف` — the letter's name |
| `ba.mp3` | `بَاء` |
| `ba-fatha.mp3` | `بَ` — the letter carrying the vowel, i.e. the sound *ba* |
| `ba-kasra.mp3` | `بِ` |

Sending `"Alif"` would reproduce the exact bug that got browser speech synthesis
removed: an English voice reading English spelling. The vowelled forms send the
glyph rather than the name because the Fatha control is asking for *ba*, not for
the word "bāʾ". The text lives in `letterSpeechText()` in
[`client/src/lib/arabicLetters.ts`](client/src/lib/arabicLetters.ts).

#### Generating them

```bash
OPENAI_API_KEY=sk-... node scripts/generate-letter-audio.mjs
```

| Flag | Effect |
| ---- | ------ |
| `--dry-run` | Print every filename and the Arabic that would be sent. Calls nothing. |
| `--only=alif,ba` | Restrict to some letters. |
| `--force` | Regenerate clips that already exist (default: skip them). |
| `--voice=onyx` | Override the voice; `OPENAI_TTS_VOICE` does the same. |

Existing clips are skipped, so an interrupted run resumes where it stopped, and
a failed clip can be retried on its own. The run writes
`client/public/audio/letters/generated.json` recording the model, voice and the
exact text behind every clip — that file is how you tell later which clips are
synthesised and which have been replaced by a recording.

**Listen before shipping.** The likely mistake is a vowelled form read as the
letter's name — `بَ` said as "bāʾ" rather than *ba*. Fix the text for that clip
in `SPEECH_TEXT_OVERRIDES` at the top of the script and re-run with `--force`.

Check what is present at any time:

```bash
node scripts/check-letter-audio.mjs
```

### Adding recordings

Drop `.mp3` files into `client/public/audio/letters/`, over the generated ones
of the same name, and flip `ACTIVE_LETTER_AUDIO_SOURCE` to `HAFIZ_RECORDINGS` in
[`client/src/lib/letterAudioSources.ts`](client/src/lib/letterAudioSources.ts):

```ts
export const ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = OPENAI_TTS;
//                                                           ^ HAFIZ_RECORDINGS
```

Both sources build the same paths, so the files replace each other by name
alone; that one line only changes how the audio is described to the learner. A
test pins the two path builders together so the swap cannot quietly become a
migration.

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
| `client/src/lib/letterAudioSources.ts` | Which set of recordings is playing, and the one-line switch between them. |
| `scripts/generate-letter-audio.mjs` | The one-off generator: 112 clips from Arabic text via OpenAI TTS. |
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
  src/contexts/    Theme and instruction-language providers
  src/hooks/       Client hooks, incl. letter audio playback
  src/lib/         Client helpers, incl. the Arabic letter table
  public/audio/    Reciter recordings served as static assets
locales/         Instruction-language packs (en reference, ur scaffold)
api/             Vercel serverless entry (exports the Express app)
server/          Express + tRPC backend
  _core/app.ts     Express app: routes and middleware, no listener
  _core/index.ts   Local entry: HTTP server, port scan, Vite dev middleware
  _core/           OAuth, storage, AI integrations
  routers.ts       tRPC router definitions
  quranApi.ts      Quran.com API client (surahs, juz, verses, audio)
  quranCache.ts    TTL cache in front of Quran.com
  recitation.ts    Word-recall alignment for recorded attempts
  db.ts            Drizzle queries
shared/          Types and constants shared across client and server
                 (incl. recording.ts — the audio size cap both sides enforce)
drizzle/         Schema and migrations
scripts/         Manual smoke tests and generators
```

Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`,
`@locales/` → `locales/`.

---

## License

MIT
