# Edit.or.lynk Licensing System — Deployment Guide

## Prerequisites

- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed (`npm install -g wrangler`)
- Node.js 18+ (for Wrangler and the worker runtime)
- A Freebuff Sites project (or a Cloudflare Workers project with D1 and R2 bindings)

## 1. Local Development

### Start the local Worker

```bash
cd website
npx wrangler dev --port 8789
```

The server will be available at `http://127.0.0.1:8789`. The first run will create a local D1 database named `edit-or-lynk-licensing`.

### Environment variables

Copy `.dev.vars.example` to `.dev.vars` and set the following local values:

```
ADMIN_TOKEN=local-admin-token-change-me    # Used for /api/admin/* routes
LICENSE_SECRET=local-license-secret-change-me   # Used to sign license tokens
INSTAGRAM_HANDLE=editorlynk                 # Shown on the key generation page
```

These values are **local only** — never commit them. On hosted Sites, set the same names under **Sites → Secrets**.

### Running the API test suite

```bash
# terminal 1
npx wrangler dev --port 8788
# terminal 2
bash tests/api.test.sh http://127.0.0.1:8788
```

This runs end-to-end tests against the local Worker. All tests use the local D1 database, so keys created here are throwaway.

Notes:

- Apply migrations once per fresh checkout: `npx wrangler d1 migrations apply edit-or-lynk-licensing --local`. (The Worker also bootstraps its schema idempotently on the first API request.)
- Rate limiting persists across runs: a re-run inside the 15-minute window will legitimately fail validation checks with `429`. Clear the local `rate_limits` table in the D1 sqlite under `.wrangler/state/v3/d1/` before repeating the suite.

## 2. Production Deployment

### Prepare the Worker

```bash
cd website
# Build any assets if needed (the worker serves static from ./public)
npx wrangler publish
```

### Set secrets in the hosted environment

Under **Sites → Secrets** (for your site), add:

| Secret name          | Value                                   |
|----------------------|-----------------------------------------|
| `ADMIN_TOKEN`        | Your secure admin token (never share)   |
| `LICENSE_SECRET`     | A random secret for signing licenses    |
| `INSTAGRAM_HANDLE`   | Your Instagram handle (e.g. `editorlynk`) |

These are injected as Worker bindings (`env.ADMIN_TOKEN`, `env.LICENSE_SECRET`, `env.INSTAGRAM_HANDLE`).

### D1 database

The Worker's `wrangler.jsonc` (or the manifest for hosted Sites) creates a D1 database named `edit-or-lynk-licensing` with the schema from `migrations/0001_init.sql`. On first deployment, the tables are created automatically.

### Instagram verification

The Instagram eligibility check requires Meta's approval. Until the app is verified:

- The key generation page will show *"Instagram verification isn't active yet"*
- No keys can be issued automatically
- Users can still enter their name, get a code, and message it to the Instagram profile
- Once Meta approves the app's `instagram_business_manage_messages` permission, the site will be able to confirm follows and issue keys

Set these optional secrets once approved (leave unset otherwise):

| Secret name          | Value                                   |
|----------------------|-----------------------------------------|
| `INSTAGRAM_APP_SECRET` | Your Instagram OAuth app secret         |
| `INSTAGRAM_ACCESS_TOKEN` | A long-lived Instagram access token   |
| `INSTAGRAM_USER_ID`   | Your Instagram user ID                  |
| `INSTAGRAM_VERIFY_TOKEN` | The verify token used in the webhook   |

## 3. License Flow

### In-app activation

1. User clicks **Pro** in the sidebar → Pro window opens
2. User enters a Pro key and clicks **Activate Pro**
3. The app sends the key to `POST /api/license/validate`
4. The backend validates the key, checks redemption limits, and issues a signed license token
5. The token is stored in the Keychain (`com.editorlynk.license`)
6. The app UI updates to show **PRO** status and enables Pro features

### Key generation (website)

1. User opens the Pro Key Generation page
2. User enters their name and clicks **Continue to Instagram**
3. The Instagram profile opens (app scheme → web fallback)
4. User follows the account and sends the one-time code as a DM
5. The website polls the backend for verification status
6. If eligibility is confirmed, the Pro key is generated and displayed
7. User copies the key and pastes it into the app

### Admin operations

1. Open the admin page (`/admin.html`)
2. Enter the admin token and click **Unlock**
3. Use the sidebar to:
   - **Generate keys** (cryptographically random, one redemption each)
   - **Revoke keys** (stops Pro access at next check)
   - **Search** and **filter** keys by status
   - **View audit log** of all operations

## 4. Rate Limiting

Validation requests (`/api/license/validate`) are rate-limited per key+device combination. The backend allows a reasonable number of attempts before returning `429 Too Many Requests`. This prevents brute-force key searches.

## 5. Rollback

If a deployment introduces issues:

```bash
# List previous deployments
wrangler deployment list

# Roll back to a previous deployment
wrangler deployment reversion <deployment-id>
```

## 6. Limitations

- Instagram follow verification requires Meta's approval of the app's `instagram_business_manage_messages` permission. Without it, the key generation pagehonestly reports that verification is not configured.
- Keys are single-use (redemption_limit = 1 by default). Admins can set a different limit when generating.
- License tokens are revalidated daily; offline operation is supported within a 7-day grace period after the last revalidation.
- The Pro Key Generation website is a static page + Worker API; it does not include a browser-based Instagram login or automated scraping.