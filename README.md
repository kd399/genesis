# Genesis — AI-Powered HighLevel App Builder

> Generate HighLevel marketplace apps from natural language prompts. Chat → Code → Live Preview with real CRM data.

**Live URLs**

- Frontend: `https://app-builder-77fdb.web.app`
- Functions base: `https://us-central1-app-builder-77fdb.cloudfunctions.net/`

**Loom Demo:** [Add link after recording]

---

## HighLevel Setup

1. Go to [developers.gohighlevel.com](https://developers.gohighlevel.com) → create a Marketplace App
2. Set OAuth Redirect URI to:
   ```
   https://us-central1-app-builder-77fdb.cloudfunctions.net/hlOAuthCallback
   ```
   For local dev:
   ```
   http://localhost:5001/YOUR_PROJECT_ID/us-central1/hlOAuthCallback
   ```
3. Enable scopes: `contacts.readonly`, `contacts.write`, `conversations.readonly`, `conversations.write`, `calendars.readonly`, `calendars/events.readonly`
4. Create a Sandbox account from your developer dashboard for safe testing

---

## Local Setup

### Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project created at [console.firebase.google.com](https://console.firebase.google.com)

### 1. Clone & install

```bash
git clone https://github.com/kd399/genesis.git
cd genesis

# Frontend
cd frontend && npm install && cd ..

# Functions
cd functions && npm install && cd ..
```

### 2. Configure environment

**Frontend** (`frontend/.env`):

```bash
cp frontend/.env.example frontend/.env
# Fill in Firebase config from Firebase console → Project Settings → Your Apps
```

**Functions** (`functions/.env`):

```bash
cp functions/.env.example functions/.env
# Fill in HL Client ID/Secret and Anthropic API key
```

**Firebase project** (`.firebaserc`):

```json
{ "projects": { "default": "YOUR_FIREBASE_PROJECT_ID" } }
```

### 3. Enable Firebase services

In Firebase console:

- Authentication → Sign-in methods → Email/Password → Enable
- Firestore → Create database (start in test mode, then apply `firestore.rules`)
- Functions → Upgrade to Blaze plan (required for outbound HTTP)

### 4. Run locally

```bash

# Functions
cd functions && npm run build && cd ..

# Terminal 1 — Firebase emulators
firebase emulators:start

# Frontend
# Terminal 2 — Vue dev server
cd frontend && npm run build && npm run dev
```

Open: `http://localhost:5173`
Emulator UI: `http://localhost:4000`

---

## Architecture Decisions

1. **Browser → Firebase → HighLevel** — HL OAuth tokens never reach the browser. All HL API calls go through Cloud Functions. This is the correct marketplace app architecture.

2. **SSE over WebSockets** — Server-Sent Events are sufficient for one-directional LLM token streaming and require no socket infrastructure. Simpler, cheaper, Firebase-compatible.

3. **Structured LLM output (JSON + prefill trick)** — Claude is instructed to return a JSON array of `{operation, path, content}` objects. An assistant prefill turn starting with `[` forces the model to output valid JSON — it cannot switch to plain text or delimiter format mid-stream. The backend validates and sanitizes before persisting.

4. **srcdoc preview over WebContainers** — Generated apps are vanilla HTML+JS (no build step). `srcdoc` preview works instantly with no build infrastructure. External JS/CSS files are inlined at runtime before assignment.

5. **Token via postMessage** — The preview iframe receives the Firebase ID token through `postMessage`. The token is never embedded in HTML. The iframe calls our HL proxy (not HL directly), keeping secrets on the server.

6. **Firestore real-time listeners** — Files and messages use `onSnapshot` for instant UI updates after generation. No polling needed.

7. **File ID = path with slashes replaced** — Firestore document IDs can't contain `/`. Using `path.replace(/\//g, '__')` gives deterministic IDs for upsert-friendly writes and safe lookups.

8. **Snapshot = full file set copy per generation** — Each generation snapshots the complete merged file set (existing + newly written − deleted). Simple, reliable restore. Acceptable storage cost at this scale.

9. **Firestore-backed rate limiting** — A sliding-window counter stored per `(uid, endpoint)` in `_rateLimits` collection (admin SDK only, locked out from client). `generateStream` is capped at 10 req/min; `highlevelProxy` at 60 req/min. Fail-open on Firestore errors to avoid blocking legitimate traffic.

---

## What I Would Improve

1. **Monaco + Sandpack hybrid** — Use Sandpack for preview so generated Vue SFCs can be previewed with a real build pipeline, not just vanilla HTML+JS.
2. **Streaming JSON parsing** — Parse file operations incrementally during streaming so the file tree updates live instead of waiting for the full Anthropic response to accumulate.
3. **Webhook support** — Allow generated apps to register HL webhooks (new contact, appointment booked) for real-time reactive dashboards.
4. **Delta snapshots** — Store file diffs instead of full file copies per snapshot to reduce Firestore storage for large projects with many iterations.
5. **Workspace collaboration** — Multi-user project sharing with Firestore security rules scoped to a shared `memberIds` array rather than a single `userId`.

---

## Deployment

```bash
# Build functions
cd functions && npm run build && cd ..

# Build frontend
cd frontend && npm run build && cd ..

# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

### Secrets (production)

Use Firebase Secret Manager instead of `.env`:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set HIGHLEVEL_CLIENT_SECRET
firebase functions:secrets:set HIGHLEVEL_CLIENT_ID
firebase functions:secrets:set HIGHLEVEL_REDIRECT_URI
firebase functions:secrets:set FRONTEND_URL
firebase functions:secrets:set FUNCTIONS_BASE_URL
# Optional: HuggingFace fallback
firebase functions:secrets:set HF_TOKEN
```

Secrets are declared via `firebase-functions/params` (`defineSecret`) in `functions/src/secrets.ts` and injected at deploy time — never committed to source.

---

## Project Structure

```
genesis/
├── docs/                   # Docs
|
├── frontend/               # Vue 3 SPA
│   └── src/
│       ├── components/
│       │   ├── ui/         # Button, Input, Badge, Card, Label (ShadCN-based)
│       │   ├── dashboard/  # CreateProjectDialog
│       │   └── workspace/  # ChatPanel, CodeEditor, FileTree, PreviewPanel,
│       │                   # SnapshotDrawer, DiffView
│       ├── stores/         # auth, highlevel, projects, workspace (Pinia)
│       ├── views/          # Login, Signup, Dashboard, Workspace, OAuthCallback
│       ├── services/       # firebase.ts — app + Firestore + Auth init
│       ├── router/         # index.ts with auth guards
│       └── types/          # index.ts — all TypeScript types + SSEEvent union
│
├── functions/src/          # Firebase Cloud Functions (Node 20, TypeScript)
│   ├── highlevel/          # oauth.ts, client.ts, proxy.ts, contacts.ts,
│   │                       # conversations.ts, calendars.ts, dummy.ts
│   ├── generation/         # index.ts (SSE stream + LLM orchestration),
│   │                       # prompt.ts (system prompt builder),
│   │                       # parser.ts (6-strategy LLM response parser)
│   ├── projects/           # CRUD — list, create, update, soft-delete
│   ├── files/              # list, get, save
│   ├── snapshots/          # list, restore, createSnapshot (internal helper)
│   ├── auth/               # middleware.ts — verifyAuth
│   ├── rateLimit.ts        # Firestore sliding-window rate limiter
│   ├── secrets.ts          # Firebase Secret Manager param declarations
│   ├── cors.ts             # CORS middleware
│   ├── admin.ts            # firebase-admin init (db, auth exports)
│   └── index.ts            # Function export entry point
│
├── firestore.rules         # Security rules — user-scoped ownership checks
├── firestore.indexes.json  # Composite indexes for ordered queries
├── firebase.json           # Hosting rewrites + emulator config
└── .env.example            # All required environment variables
```
