/**
 * Edit.or.lynk licensing Worker.
 *
 * Answers four clients:
 *   • the app    — POST /api/license/validate (key in, signed license out)
 *   • the site   — POST /api/campaign/session, GET /api/campaign/session/:id
 *   • Meta       — GET/POST /api/webhooks/instagram (signature checked, follow verified)
 *   • the owner  — /api/admin/* behind X-Admin-Token
 *
 * Secrets come from the environment (Sites → Secrets):
 *   ADMIN_TOKEN          the admin page's password
 *   LICENSE_SECRET       HMAC key that signs license tokens
 *   INSTAGRAM_APP_SECRET verifies Meta's webhook signature
 *   INSTAGRAM_ACCESS_TOKEN user token for the User Profile follow check
 *   INSTAGRAM_USER_ID      the connected professional account (Instagram user id)
 *   INSTAGRAM_HANDLE       the profile the site sends people to (no @)
 */

const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEY_PREFIX = "ELNK";
const KEY_GROUP = 4;
const KEY_GROUPS = 4;
const DEFAULT_KEY_DAYS = 365;
const VALIDATE_WINDOW = 900; // seconds
const VALIDATE_LIMIT = 30;
const CAMPAIGN_WINDOW = 600;
const CAMPAIGN_LIMIT = 5;

// ---------------------------------------------------------------------------
// Entry

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/webhooks/instagram" && request.method === "GET") {
      return webhookVerify(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  try {
    await ensureSchema(env);
    const path = url.pathname;

    if (request.method === "POST" && path === "/api/license/validate") {
      return validateLicense(request, env);
    }
    if (request.method === "POST" && path === "/api/campaign/session") {
      return createSession(request, env);
    }
    if (request.method === "GET" && path.startsWith("/api/campaign/session/")) {
      return readSession(path.split("/").pop(), env);
    }
    if (request.method === "POST" && path === "/api/webhooks/instagram") {
      return webhookReceive(request, env);
    }
    if (path.startsWith("/api/admin/")) {
      return admin(request, env, url);
    }
    return json({ ok: false, error: "Unknown request." }, 404);
  } catch (error) {
    return json({ ok: false, error: "Server error.", detail: String(error && error.message ? error.message : error) }, 500);
  }
}

// ---------------------------------------------------------------------------
// Schema (idempotent: the first request creates what it needs)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_plain TEXT UNIQUE NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at INTEGER NOT NULL,
  redemption_limit INTEGER NOT NULL DEFAULT 1,
  redemptions INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS activations (
  key_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (key_id, device_id)
);
CREATE TABLE IF NOT EXISTS campaign_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_dm',
  key_id TEXT,
  instagram_scoped_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
`;

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  for (const statement of SCHEMA.split(";")) {
    const sql = statement.trim();
    if (!sql) continue;
    // prepare().run() rather than exec(): D1's exec() misparses multi-line
    // statements locally and fails with "incomplete input".
    await env.DB.prepare(sql).run();
  }
  schemaReady = true;
}

async function audit(env, action, subject, detail) {
  await env.DB.prepare("INSERT INTO audit (at, action, subject, detail) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), action, subject || "", detail || "")
    .run();
}

// ---------------------------------------------------------------------------
// Rate limiting

async function allow(env, bucket, limit, windowSeconds) {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
    .bind(bucket, windowStart)
    .first();
  const used = row ? row.count : 0;
  if (used >= limit) return false;
  await env.DB.prepare(
    "INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1"
  ).bind(bucket, windowStart).run();
  return true;
}

function clientKey(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
}

// ---------------------------------------------------------------------------
// Keys and tokens

function randomString(length, alphabet) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function newKey() {
  const groups = [];
  for (let i = 0; i < KEY_GROUPS; i++) {
    groups.push(randomString(KEY_GROUP, KEY_ALPHABET));
  }
  return [KEY_PREFIX, ...groups].join("-");
}

function normalizeKey(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signToken(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const body = Buffer.from(payload).toString("base64url");
  const mac = Buffer.from(signature).toString("base64url");
  return `${body}.${mac}`;
}

function verificationConfigured(env) {
  return Boolean(env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_USER_ID && env.INSTAGRAM_HANDLE);
}

// ---------------------------------------------------------------------------
// License validation (the app)

async function validateLicense(request, env) {
  const ip = clientKey(request);
  if (!(await allow(env, `validate:${ip}`, VALIDATE_LIMIT, VALIDATE_WINDOW))) {
    return json({ ok: false, error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  const body = await readJson(request);
  const key = normalizeKey(body.key);
  const deviceId = String(body.deviceId || "").slice(0, 64);

  if (!key) return json({ ok: false, error: "A key is required." }, 400);

  const hash = await sha256Hex(key);
  const row = await env.DB.prepare("SELECT * FROM licenses WHERE key_hash = ?").bind(hash).first();
  if (!row) {
    await audit(env, "validate.miss", key.slice(0, 9), `ip ${ip}`);
    return json({ ok: false, error: "invalid" }, 400);
  }

  if (row.status === "revoked") {
    await audit(env, "validate.revoked", row.id, `ip ${ip}`);
    return json({ ok: false, reason: "revoked" }, 409);
  }

  const now = Date.now();
  if (row.expires_at <= now) {
    await audit(env, "validate.expired", row.id, "");
    return json({ ok: false, reason: "expired" }, 409);
  }

  // Redemption limit: one activation per device, up to the key's limit.
  const existing = deviceId
    ? await env.DB.prepare("SELECT 1 AS hit FROM activations WHERE key_id = ? AND device_id = ?")
        .bind(row.id, deviceId).first()
    : null;

  if (!existing) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM activations WHERE key_id = ?")
      .bind(row.id).first();
    if ((count ? count.n : 0) >= row.redemption_limit) {
      await audit(env, "validate.redeemed", row.id, `limit ${row.redemption_limit}`);
      return json({ ok: false, reason: "redeemed" }, 409);
    }
    if (deviceId) {
      await env.DB.prepare("INSERT INTO activations (key_id, device_id, first_seen) VALUES (?, ?, ?)")
        .bind(row.id, deviceId, now).run();
    }
    await env.DB.prepare("UPDATE licenses SET redemptions = redemptions + 1 WHERE id = ?").bind(row.id).run();
    await audit(env, "activate", row.id, deviceId ? `device ${deviceId.slice(0, 8)}` : "no device");
  }

  const expiresAt = row.expires_at;
  const payload = `${row.id}|${row.plan}|${expiresAt}`;
  const token = await signToken(env.LICENSE_SECRET || "edit-or-lynk", payload);

  return json({
    ok: true,
    plan: row.plan,
    keyId: row.id,
    token,
    expiresAt: Math.floor(expiresAt / 1000)
  });
}

// ---------------------------------------------------------------------------
// Campaign sessions (the Pro Key site)

async function createSession(request, env) {
  const ip = clientKey(request);
  if (!(await allow(env, `campaign:${ip}`, CAMPAIGN_LIMIT, CAMPAIGN_WINDOW))) {
    return json({ ok: false, error: "Too many attempts from this network. Try again shortly." }, 429);
  }

  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 60);
  if (name.length < 2) return json({ ok: false, error: "Please enter your name." }, 400);

  const id = crypto.randomUUID();
  const code = randomString(8, KEY_ALPHABET);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO campaign_sessions (id, name, code, status, created_at, expires_at) VALUES (?, ?, ?, 'awaiting_dm', ?, ?)"
  ).bind(id, name, code, now, now + 6 * 3600 * 1000).run();

  await audit(env, "campaign.session", id, name);

  return json({
    ok: true,
    sessionId: id,
    code,
    handle: env.INSTAGRAM_HANDLE || "",
    verificationConfigured: verificationConfigured(env),
    expiresInMinutes: 360
  });
}

async function readSession(id, env) {
  const row = await env.DB.prepare("SELECT * FROM campaign_sessions WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "Session not found." }, 404);

  const now = Date.now();
  if (row.expires_at <= now && row.status !== "issued") {
    row.status = "expired";
  }

  const response = { ok: true, status: row.status, verificationConfigured: verificationConfigured(env) };

  if (row.status === "issued" && row.key_id) {
    const key = await env.DB.prepare("SELECT key_plain, expires_at FROM licenses WHERE id = ?").bind(row.key_id).first();
    if (key) {
      response.key = key.key_plain;
      response.keyExpiresAt = Math.floor(key.expires_at / 1000);
    }
  }
  if (row.status === "not_following") {
    response.message = "That account doesn't follow the profile yet. Follow it, then message the code again.";
  }
  return json(response);
}

// ---------------------------------------------------------------------------
// Instagram webhook

function webhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === (env.INSTAGRAM_VERIFY_TOKEN || "editorlynk-verify")) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function webhookReceive(request, env) {
  const raw = await request.text();

  if (env.INSTAGRAM_APP_SECRET) {
    const provided = request.headers.get("x-hub-signature-256") || "";
    const expected = `sha256=${await hmacHex(env.INSTAGRAM_APP_SECRET, raw)}`;
    if (!timingSafeEqual(provided, expected)) {
      return json({ ok: false, error: "Bad signature." }, 403);
    }
  } else {
    // Without the app secret we cannot trust anything on this port.
    return json({ ok: false, error: "Instagram verification is not configured." }, 503);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Bad payload." }, 400);
  }

  const entries = payload.entry || [];
  for (const entry of entries) {
    const messages = entry.messaging || [];
    for (const message of messages) {
      const text = String((message.message && message.message.text) || "").trim().toUpperCase();
      const sender = message.sender && message.sender.id;
      if (!text || !sender) continue;
      await handleDirectMessage(env, text, sender);
    }
  }
  return json({ ok: true });
}

async function handleDirectMessage(env, text, senderId) {
  const session = await env.DB.prepare(
    "SELECT * FROM campaign_sessions WHERE code = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(text, Date.now()).first();
  if (!session) return;

  if (!verificationConfigured(env)) {
    await env.DB.prepare("UPDATE campaign_sessions SET status = 'not_configured', instagram_scoped_id = ? WHERE id = ?")
      .bind(senderId, session.id).run();
    await audit(env, "campaign.unconfigured", session.id, "missing Instagram permissions");
    return;
  }

  await env.DB.prepare("UPDATE campaign_sessions SET status = 'dm_received', instagram_scoped_id = ? WHERE id = ?")
    .bind(senderId, session.id).run();

  // The one official check: does this person follow the connected professional account?
  const profileUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(senderId)}?fields=is_user_follow_business&access_token=${encodeURIComponent(env.INSTAGRAM_ACCESS_TOKEN)}`;
  let follows = false;
  try {
    const res = await fetch(profileUrl);
    const json = await res.json();
    follows = Boolean(json && json.is_user_follow_business);
  } catch {
    await env.DB.prepare("UPDATE campaign_sessions SET status = 'check_failed' WHERE id = ?").bind(session.id).run();
    await audit(env, "campaign.check_failed", session.id, "profile lookup failed");
    return;
  }

  if (!follows) {
    await env.DB.prepare("UPDATE campaign_sessions SET status = 'not_following' WHERE id = ?").bind(session.id).run();
    await audit(env, "campaign.not_following", session.id, senderId.slice(0, 8));
    return;
  }

  const key = await issueKey(env, {
    plan: "pro",
    days: DEFAULT_KEY_DAYS,
    note: `campaign:${session.name}`,
    limit: 1
  });
  await env.DB.prepare("UPDATE campaign_sessions SET status = 'issued', key_id = ? WHERE id = ?")
    .bind(key.id, session.id).run();
  await audit(env, "campaign.issued", session.id, key.id);
}

// ---------------------------------------------------------------------------
// Admin

async function admin(request, env, url) {
  const token = request.headers.get("x-admin-token") || "";
  const expected = env.ADMIN_TOKEN || "";
  if (!expected || !timingSafeEqual(token, expected)) {
    return json({ ok: false, error: "Not authorised." }, 401);
  }

  const path = url.pathname.replace("/api/admin", "");

  if (request.method === "GET" && path === "/overview") {
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status = 'active'").first();
    const revoked = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status = 'revoked'").first();
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first();
    const sessions = await env.DB.prepare("SELECT COUNT(*) AS n FROM campaign_sessions").first();
    const issued = await env.DB.prepare("SELECT COUNT(*) AS n FROM campaign_sessions WHERE status = 'issued'").first();
    return json({
      ok: true,
      active: active ? active.n : 0,
      revoked: revoked ? revoked.n : 0,
      total: total ? total.n : 0,
      sessions: sessions ? sessions.n : 0,
      issued: issued ? issued.n : 0
    });
  }

  if (request.method === "GET" && path === "/keys") {
    const query = (url.searchParams.get("q") || "").trim().toUpperCase();
    const status = url.searchParams.get("status") || "";
    let sql = "SELECT * FROM licenses";
    const clauses = [];
    const bindings = [];
    if (query) {
      clauses.push("UPPER(key_plain) LIKE ?");
      bindings.push(`%${query}%`);
    }
    if (status) {
      clauses.push("status = ?");
      bindings.push(status);
    }
    if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
    sql += " ORDER BY created_at DESC LIMIT 200";
    const rows = await env.DB.prepare(sql).bind(...bindings).all();
    return json({ ok: true, keys: rows.results || [] });
  }

  if (request.method === "POST" && path === "/keys") {
    const body = await readJson(request);
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const days = Math.max(1, Math.min(3650, Number(body.days) || DEFAULT_KEY_DAYS));
    const limit = Math.max(1, Math.min(10, Number(body.limit) || 1));
    const note = String(body.note || "manual").slice(0, 80);
    const issued = [];
    for (let i = 0; i < count; i++) {
      issued.push(await issueKey(env, { plan: "pro", days, note, limit }));
    }
    await audit(env, "admin.generate", `${issued.length} key(s)`, note);
    return json({ ok: true, keys: issued.map((k) => ({ id: k.id, key: k.key, expiresAt: k.expiresAt })) });
  }

  const revokeMatch = path.match(/^\/keys\/([^/]+)\/revoke$/);
  if (request.method === "POST" && revokeMatch) {
    const id = revokeMatch[1];
    const result = await env.DB.prepare(
      "UPDATE licenses SET status = 'revoked', revoked_at = ? WHERE id = ?"
    ).bind(Date.now(), id).run();
    if (!result.meta.changes) return json({ ok: false, error: "Key not found." }, 404);
    await audit(env, "admin.revoke", id, "");
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/audit") {
    const rows = await env.DB.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all();
    return json({ ok: true, entries: rows.results || [] });
  }

  return json({ ok: false, error: "Unknown admin request." }, 404);
}

async function issueKey(env, { plan, days, note, limit }) {
  const id = crypto.randomUUID();
  let key = newKey();
  // A collision would break the unique index; redraw until it is free.
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await env.DB.prepare("SELECT 1 AS hit FROM licenses WHERE key_plain = ?").bind(key).first();
    if (!clash) break;
    key = newKey();
  }
  const now = Date.now();
  const expiresAt = now + days * 24 * 3600 * 1000;
  const hash = await sha256Hex(key);
  await env.DB.prepare(
    "INSERT INTO licenses (id, key_plain, key_hash, plan, status, expires_at, redemption_limit, redemptions, note, created_at) " +
      "VALUES (?, ?, ?, ?, 'active', ?, ?, 0, ?, ?)"
  ).bind(id, key, hash, plan, expiresAt, limit, note, now).run();
  return { id, key, expiresAt };
}

// ---------------------------------------------------------------------------
// Helpers

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(object, status = 200) {
  return new Response(JSON.stringify(object), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
