# Genesis — AI-Powered HighLevel App Builder

> Generate HighLevel marketplace apps from natural language prompts. Chat → Code → Live Preview with real CRM data.

**Live URLs**

- Frontend: `https://YOUR_PROJECT_ID.web.app`
- Functions base: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net`

**Loom Demo:** [Add link after recording]

---

## HighLevel Setup

1. Go to [developers.gohighlevel.com](https://developers.gohighlevel.com) → create a Marketplace App
2. Set OAuth Redirect URI to:
   ```
   https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/hlOAuthCallback
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
git clone https://github.com/YOUR_USERNAME/genesis.git
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
# Terminal 1 — Firebase emulators
firebase emulators:start

# Terminal 2 — Vue dev server
cd frontend && npm run dev
```

Open: `http://localhost:5173`
Emulator UI: `http://localhost:4000`

---

## Architecture Decisions

1. **Browser → Firebase → HighLevel** — HL OAuth tokens never reach the browser. All HL API calls go through Cloud Functions. This is the correct marketplace app architecture.

2. **SSE over WebSockets** — Server-Sent Events are sufficient for one-directional LLM token streaming and require no socket infrastructure. Simpler, cheaper, Firebase-compatible.

3. **Structured LLM output** — Claude is instructed to return a JSON array of `{operation, path, content}` objects. The backend validates and sanitizes before persisting. This prevents prompt injection from corrupting the file system.

4. **srcdoc preview over WebContainers** — Generated apps are vanilla HTML+JS (no build step). srcdoc preview works instantly with no build infrastructure. WebContainers would add complexity without benefit for this use case.

5. **Token via postMessage** — The preview iframe receives the Firebase ID token through `postMessage`. The token is never embedded in HTML. The iframe calls our HL proxy (not HL directly), keeping secrets on the server.

6. **Firestore real-time listeners** — Files and messages use `onSnapshot` for instant UI updates after generation. No polling needed.

7. **File ID = path with slashes replaced** — Firestore document IDs can't contain `/`. Using `path.replace(/\//g, '__')` gives deterministic IDs for upserts and lookups.

8. **Snapshot = full file set copy** — Each generation snapshots all current files (not a diff). Simple, reliable restore. Acceptable for this scale.

9. **Token refresh with 5-min buffer** — Access tokens are refreshed 5 minutes before expiry. One retry on 401 ensures failed requests recover transparently.

10. **Soft deletes for projects** — `deletedAt` timestamp instead of document deletion. Allows recovery and avoids Firestore cascade concerns.

---

## What I Would Improve

1. **Monaco + Sandpack hybrid** — Use Sandpack for preview so generated Vue SFCs can be previewed with a real build pipeline, not just vanilla HTML.
2. **Streaming JSON parsing** — Parse file operations incrementally during streaming so the file tree updates live instead of waiting for generation to complete.
3. **Webhook support** — Allow generated apps to register HL webhooks (new contact, appointment booked) for real-time reactive dashboards.
4. **Multi-turn context window** — Include full conversation history in LLM context for better iterative refinement across many turns.
5. **Rate limiting** — Add per-user rate limiting on `generateStream` to prevent runaway API costs.

---

## Deployment

```bash
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
```

Then reference in functions code:

```typescript
// functions/src/index.ts
exports.generateStream = functions
  .runWith({ secrets: ['ANTHROPIC_API_KEY', 'HIGHLEVEL_CLIENT_SECRET', 'HIGHLEVEL_CLIENT_ID'] })
  ...
```

---

## Project Structure

```
genesis/
├── frontend/               # Vue 3 SPA
│   └── src/
│       ├── components/
│       │   ├── ui/         # Button, Input, Badge, Card
│       │   ├── dashboard/  # CreateProjectDialog
│       │   └── workspace/  # ChatPanel, CodeEditor, FileTree, PreviewPanel, SnapshotDrawer
│       ├── stores/         # auth, highlevel, projects, workspace (Pinia)
│       ├── views/          # Login, Signup, Dashboard, Workspace, OAuthCallback
│       ├── services/       # firebase.ts
│       ├── router/         # index.ts with auth guards
│       └── types/          # index.ts — all TypeScript types
│
├── functions/src/          # Firebase Cloud Functions
│   ├── highlevel/          # oauth.ts, client.ts, proxy.ts, contacts/convos/calendars
│   ├── generation/         # index.ts (SSE stream), prompt.ts, parser.ts
│   ├── projects/           # CRUD
│   ├── files/              # list, get, save
│   ├── snapshots/          # list, restore, createSnapshot
│   └── auth/               # middleware.ts
│
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── .env.example
```
