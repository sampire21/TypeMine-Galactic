# Cloudflare Workers Setup

This project deploys as a **Cloudflare Worker** (not Pages). The worker serves the
static frontend and handles all `/api/*` routes.

---

## Step 1 — Create a KV namespace

1. Go to your Cloudflare dashboard → **Workers & Pages → KV**.
2. Click **Create a namespace**, name it something like `typing_app_prod`.
3. Note the **Namespace ID** (a 32-char hex string).
4. Optionally create a second namespace for preview/staging (`typing_app_preview`).

---

## Step 2 — Update wrangler.toml

Replace the placeholder IDs with your real IDs:

```toml
[[kv_namespaces]]
binding = "TYPING_APP"
id = "<your production namespace id>"
preview_id = "<your preview namespace id>"
```

> **Important:** These IDs must match the namespace IDs in your Cloudflare dashboard.
> If they drift (e.g. after re-creating a namespace), users will see
> "Invalid username or password" because the worker is reading an empty namespace.

---

## Step 3 — Set the TOKEN_SECRET environment variable

This secret signs authentication tokens. **It must be set or all logins will fail with 500.**

1. Go to your Cloudflare dashboard → **Workers & Pages → your worker → Settings → Variables**.
2. Add an **Environment Variable**:
   - Name: `TOKEN_SECRET`
   - Value: a long random secret (32+ characters, e.g. output of `openssl rand -hex 32`)
3. Encrypt the variable so it isn't visible after saving.

> **Security:** Without this variable set, the worker throws an error on any auth
> operation. Never use a guessable default — tokens can be forged if the secret leaks.

---

## Step 4 — (Optional) Set admin credentials

To use the admin panel, add one of these variables in the same dashboard section:

- `ADMIN_USER_ID` — the UUID of your admin account (most secure)
- `ADMIN_USERNAME` — your username (if neither is set, no account has admin access)

---

## Step 5 — Deploy

```bash
npx wrangler deploy
```

---

## API routes

All of the following are handled by `worker.js`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signup` | Create account |
| POST | `/api/login` | Login |
| GET | `/api/me` | Get current user |
| POST | `/api/scores` | Submit score (best-per-mode only) |
| GET | `/api/scores/me` | Get your scores |
| GET | `/api/leaderboard` | All-time or community leaderboard |
| GET | `/api/progress` | Get synced progress |
| PUT | `/api/progress` | Push synced progress |
| POST | `/api/community/contribute` | Submit community word count |
| PATCH | `/api/account` | Update username or password |
| DELETE | `/api/account` | Delete account |
| GET | `/api/user-summary` | Public profile summary |
| GET | `/api/admin/users` | List all users (admin only) |
| GET | `/api/admin/users/:id` | Get user detail (admin only) |
| PATCH | `/api/admin/users/:id` | Modify user (admin only) |

---

## Local development

The Node.js server (`server.js`) is available for local dev without Cloudflare:

```bash
node server.js
# Open http://localhost:3000
```

The local server has its own auth and storage (saved in `data/app-data.json`),
separate from the cloud KV store.
