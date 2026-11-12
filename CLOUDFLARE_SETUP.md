# Running and deploying the server

The game is a static site plus a small set of `/api/*` routes. The same route code
(`functions/api/*.js`, wired up in `functions/api/_router.js`) runs in two places:

- **Cloudflare Workers** (production): `worker.js` is the entry point and Cloudflare KV
  is the database.
- **Your own machine or a Docker container**: `server.js` runs the same routes with an
  in-memory copy of KV that is saved to `data/app-data.json`, so accounts survive a restart.

Because both use the same code, what you test locally is what runs in production.

---

## Secrets to set before deploy (checklist)

Set these in the Cloudflare dashboard under **Workers & Pages, your worker, Settings,
Variables and Secrets**. Mark the first one as a secret (encrypted).

| Name | Required | What it is |
|------|----------|------------|
| `TOKEN_SECRET` | Yes | Signs login cookies. Use a long random string: `openssl rand -hex 32`. If it is missing or shorter than 16 characters, `/api/health` reports the site as down and nobody can log in. Changing it logs everyone out. |
| `ADMIN_USERNAME` | Optional | The username that gets the admin panel (user list, flagged-score review). |
| `ADMIN_USER_ID` | Optional | Same thing by account id (safer, because a username can be renamed). Either one works. If neither is set, nobody is admin. |

There is no built-in default secret anywhere. The local server makes a random one for
each run if you did not set one and prints a warning, which means every login stops
working when you restart it. Set `TYPING_TEST_TOKEN_SECRET` to avoid that.

---

## Step 1. Create a KV namespace

1. Cloudflare dashboard, **Workers & Pages, KV**, **Create a namespace**, for example `typing_app_prod`.
2. Copy the namespace id (32 hex characters) into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TYPING_APP"
id = "<your production namespace id>"
```

If the id in `wrangler.toml` points at an empty or wrong namespace, every login says
"Invalid username or password" because the worker is reading a different database.

## Step 2. Set the secrets (see the checklist above)

## Step 3. Deploy

```bash
npx wrangler deploy
```

Open `https://<your site>/api/health`. It must answer `{"ok":true,...}`. If it answers
with `ok: false`, the message says which of the two problems (KV binding or
`TOKEN_SECRET`) needs fixing.

---

## Running locally

```bash
npm install          # only needed once, for the browser tests
node server.js       # http://localhost:3000
PORT=3001 node server.js   # any other port
```

Useful environment variables for the local server:

| Name | Meaning |
|------|---------|
| `PORT` | Port to listen on (default 3000). |
| `TYPING_TEST_TOKEN_SECRET` | Cookie signing secret (also accepts `TOKEN_SECRET`). |
| `ADMIN_USERNAME` / `ADMIN_USER_ID` | Who gets the admin panel. |
| `DATA_FILE` | Where accounts and scores are stored. Default `data/app-data.json`. |
| `TRUST_PROXY=1` | Use the `X-Forwarded-For` and `X-Forwarded-Proto` headers from a reverse proxy for the client address and for marking cookies `Secure`. Only turn this on behind a proxy you control. |
| `ASSET_CACHE=long` | Tell browsers to cache CSS, scripts and images for a year. Default is to re-check on every load, which is what you want while developing. Set automatically when `NODE_ENV=production`. |

Cookies are marked `Secure` only when the request arrived over HTTPS, so logging in on
`http://localhost` works.

### Docker

```bash
docker build -t typing-test .
TYPING_TEST_TOKEN_SECRET=$(openssl rand -hex 32) ADMIN_USERNAME=yourname docker compose -f docker/typing-test/docker-compose.yml up -d
```

The container runs `node server.js` on port 3000 (published on 8080) and keeps its data in
the `typing_data` volume.

### Tests

```bash
npm run test:backend   # fast API tests against the local adapter (about 5 seconds)
npm run test:unit      # every tests/*.test.js, including the one above
npm test               # unit tests, then the Playwright browser tests
```

---

## API routes

| Method | Path | Who | What it does |
|--------|------|-----|--------------|
| GET | `/api/health` | anyone | `{ ok: true }` when storage and the secret are in place. The page calls this once at load to decide between "Cloud account" and "Saved on this device only". |
| POST | `/api/signup` | anyone | Create an account. Body `{ username, password }`. Password 6 to 128 characters. |
| POST | `/api/login` | anyone | Log in. Sets two HttpOnly cookies (15 minute access, 30 day refresh). |
| POST | `/api/refresh` | cookie | Rotates the cookies. The previous refresh cookie keeps working for 120 seconds so a second tab is not logged out. |
| POST | `/api/logout` | cookie | Ends the session and clears the cookies. |
| GET | `/api/me` | cookie | `{ user: { id, username, createdAt, isAdmin } }` |
| POST | `/api/scores` | cookie | Submit a finished run (see "Score rules"). Always `200 { ok, ranked, flagged, score }` for a run that counts. |
| GET | `/api/scores/me?limit=50&mode=` | cookie | Your last 50 runs. |
| GET | `/api/leaderboard?tab=alltime|weekly|friends&mode=all|quotes|words|words30&limit=100` | anyone (friends needs cookie) | `{ rows: [{ userId, username, wpm, rawWpm, accuracy, consistency, time, mode, date, level }], weekKey, yourRank: { rank, wpm, total } | null, total }`. One row per player. `?community=1` returns this week's team-goal rows instead. |
| GET | `/api/friends` | cookie | `{ friends: [{ id, username, bestWpm, weeklyBestWpm, level, streak, lastSeenAt }] }` |
| POST | `/api/friends` | cookie | Body `{ username }`. Up to 50 friends. You cannot add yourself. |
| DELETE | `/api/friends/<username>` | cookie | Remove a friend. |
| GET | `/api/progress` | cookie | Saved game progress for this account. |
| PUT | `/api/progress` | cookie | Save progress. Body `{ progress, baseUpdatedAt }`. Only known keys are kept, numbers are clamped, XP may rise at most 3,000 per save and 10,000 per day (admins excepted). `409` with the server copy when another device saved first. |
| POST | `/api/community/contribute` | anyone | Body `{ words }`. Logged-in players get a named row for the week; guests are pooled into one "Guests" row, capped at 5,000 words per IP per day. |
| PATCH | `/api/account` | cookie | Change username or password. A rename is copied to the boards and the team-goal row. |
| DELETE | `/api/account` | cookie | Delete the account and every row that belongs to it. |
| GET | `/api/user-summary?username=` | anyone | Public profile card (level, badges, bests, team-goal total). Rate limited per IP. |
| GET | `/api/admin/users` | admin | List every player with level, bests, last seen. |
| GET, PATCH, DELETE | `/api/admin/users/<id>` | admin | View, edit (XP, level, streak, challenges, name, password) or delete a player. |
| GET | `/api/admin/scores?flagged=1` | admin | Runs waiting for review. |
| PATCH | `/api/admin/scores/<id>` | admin | Body `{ approved: true }` puts the run on the boards (if it is that player's best). `{ approved: false }` discards it. |

### Score rules

A run must send `wpm, rawWpm, accuracy, consistency, time, mode, typedWords, typedChars`
(`keystrokes, mistakes, backspaces` are optional). The server:

- requires `typedWords >= 1`, `typedChars >= 1`, accuracy 50 to 100, and `time >= 10` seconds
  (timed modes must be exactly 15, 30, 60 or 120 seconds, give or take one second);
- recomputes WPM as `typedChars / 5 / (time / 60)` and rejects a run whose WPM is more than
  8 percent (or 1.5 WPM, whichever is bigger) away from that;
- rejects anything over 300 WPM or over `typedWords per minute x 2.5 + 10`;
- **flags** (but still records) runs over 200 WPM, or more than 40 WPM above that player's
  previous best in the mode. Flagged runs stay off the public boards until an admin approves
  them;
- allows 60 submissions per player per 10 minutes.

### How to approve flagged scores

1. Log in as the admin account.
2. `GET /api/admin/scores?flagged=1` lists the runs with the reason each was held.
3. `PATCH /api/admin/scores/<id>` with body `{ "approved": true }` to accept, or
   `{ "approved": false }` to throw it away.

From a terminal, with the admin's cookies saved in `cookies.txt`:

```bash
curl -b cookies.txt https://<your site>/api/admin/scores?flagged=1
curl -b cookies.txt -X PATCH https://<your site>/api/admin/scores/<id> -H 'content-type: application/json' -d '{"approved":true}'
```

---

## KV key layout

| Key | Holds | Expires |
|-----|-------|---------|
| `user:<id>` | Account record (name, password hash, created and last login time). Not rewritten on normal play. | never |
| `userByName:<name>` | Lower-cased name to id. | never |
| `auth-session:<sid>` | One login session (refresh id, previous refresh id and its grace deadline, revoked flag). | 30 days |
| `seen:v1:<userId>` | Last seen time, written at most once an hour. | 30 days |
| `scores:user:<userId>` | The player's last 50 runs (each with `flagged`). | never |
| `lb:v1:<mode>:<userId>` | The player's all-time best in that mode. The row is also stored as KV metadata so one `list()` builds the whole board. | never |
| `lbw:v1:<weekKey>:<mode>:<userId>` | The player's best this UTC week (weeks start Sunday). | 5 weeks |
| `flagged:v1:<scoreId>` | A run waiting for admin review. | 90 days |
| `friends:<userId>` | List of friend ids (max 50). | never |
| `progress:user:<userId>` | Saved game progress (`{ progress, updatedAt }`). | never |
| `xpday:v1:<userId>:<date>` | XP granted today, for the daily cap. | 2 days |
| `community-contrib:v1:<weekKey>` | This week's team-goal rows (`entries` by `user:<id>` or `guests`). | 5 weeks |
| `contrib-total:v1:<userId>` | Lifetime team-goal words, updated as they are contributed. | never |
| `rate:*` | Rate-limit counters. | window length |

Boards are rebuilt from the `lb:`/`lbw:` keys and cached in memory for 30 seconds inside
each worker instance, so a new best can take up to 30 seconds to show for other players.

### Write budget per action (Cloudflare KV free plan: 1,000 writes a day)

- Login: 2 writes (session, rate counter) plus one "seen" write per hour at most.
- Score: 2 to 5 writes (rate counter, recent runs, and the best keys only when they improve).
- Progress save: 1 to 2 writes; the page saves at most once every 30 seconds, plus right
  after a finished run and when the tab is closed.
- Team-goal contribution: 2 to 3 writes.
