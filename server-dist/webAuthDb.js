"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWebAuthEnabled = isWebAuthEnabled;
exports.registerWebAuthRoutes = registerWebAuthRoutes;
exports.webAuthApiGuard = webAuthApiGuard;
exports.sendWebLoginPage = sendWebLoginPage;
exports.isWebAuthenticated = isWebAuthenticated;
exports.registerWebDataRoutes = registerWebDataRoutes;
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const node_ical_1 = __importDefault(require("node-ical"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pg_1 = require("pg");
const COOKIE_NAME = 'bct_session';
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
const DEFAULT_PROFILE_ID = 'default';
const FALLBACK_DATABASE_URL = 'postgresql://neondb_owner:npg_0EC5dtJHuAvi@ep-jolly-morning-ams2l5ga.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
let pool = null;
let schemaPromise = null;
function isWebAuthEnabled() {
    return Boolean(process.env.DATABASE_URL || FALLBACK_DATABASE_URL);
}
function getPool() {
    const connectionString = process.env.DATABASE_URL || FALLBACK_DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL missing');
    }
    if (!pool) {
        pool = new pg_1.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    }
    return pool;
}
function ensureSchema() {
    if (schemaPromise)
        return schemaPromise;
    schemaPromise = (async () => {
        const p = getPool();
        await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        current_profile_id TEXT NOT NULL DEFAULT 'default',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id, id)
      );
      CREATE TABLE IF NOT EXISTS profile_ics (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL,
        ics_text TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id, profile_id)
      );
      CREATE TABLE IF NOT EXISTS custom_events (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        event_json JSONB NOT NULL,
        PRIMARY KEY(user_id, profile_id, uid)
      );
      CREATE TABLE IF NOT EXISTS user_state (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        PRIMARY KEY(user_id, profile_id, key)
      );
    `);
    })();
    return schemaPromise;
}
function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie;
    if (!raw)
        return out;
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1)
            continue;
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}
function setSessionCookie(res, token) {
    const secure = process.env.COOKIE_SECURE === '1';
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        `Max-Age=${ONE_YEAR_SEC}`,
        'SameSite=Lax',
    ];
    if (secure)
        parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
    const secure = process.env.COOKIE_SECURE === '1';
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'Max-Age=0', 'SameSite=Lax'];
    if (secure)
        parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}
async function getSession(req) {
    await ensureSchema();
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token)
        return null;
    const p = getPool();
    const r = await p.query(`SELECT s.user_id, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`, [token]);
    if (r.rowCount !== 1)
        return null;
    return { userId: Number(r.rows[0].user_id), username: String(r.rows[0].username) };
}
async function requireUser(req) {
    if (typeof req.userId === 'number' && req.username) {
        return { userId: req.userId, username: req.username };
    }
    const s = await getSession(req);
    if (!s)
        return null;
    req.userId = s.userId;
    req.username = s.username;
    return s;
}
function normalizeProfileId(req) {
    const p = req.query.profile;
    return typeof p === 'string' && p.trim() ? p.trim() : DEFAULT_PROFILE_ID;
}
function parseEventsFromIcsText(icsText) {
    const events = node_ical_1.default.parseICS(icsText);
    const out = [];
    for (const key in events) {
        const ev = events[key];
        if (ev.type !== 'VEVENT')
            continue;
        const start = ev.start ? new Date(ev.start) : null;
        if (!start)
            continue;
        let url;
        if (typeof ev.url === 'string')
            url = ev.url;
        else if (ev.url && typeof ev.url === 'object' && 'val' in ev.url)
            url = String(ev.url.val);
        out.push({
            uid: ev.uid || key,
            title: (ev.summary || 'Untitled Event').toString(),
            course: 'Other',
            description: (ev.description || '').toString(),
            start: start.toISOString(),
            end: ev.end ? new Date(ev.end).toISOString() : undefined,
            location: ev.location ? String(ev.location) : undefined,
            url,
        });
    }
    out.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    return out;
}
async function ensureDefaultProfile(userId) {
    const p = getPool();
    await p.query(`INSERT INTO profiles(user_id, id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, id) DO NOTHING`, [userId, DEFAULT_PROFILE_ID, 'Default']);
}
function registerWebAuthRoutes(app) {
    app.post('/api/auth/register', async (req, res) => {
        try {
            await ensureSchema();
            const username = String(req.body?.username ?? '').trim();
            const password = String(req.body?.password ?? '');
            if (!username) {
                return res.status(400).json({ error: 'Username is required' });
            }
            const hash = await bcryptjs_1.default.hash(password, 10);
            const p = getPool();
            const r = await p.query(`INSERT INTO users(username, password_hash) VALUES ($1, $2) RETURNING id, username`, [username, hash]);
            const userId = Number(r.rows[0].id);
            await ensureDefaultProfile(userId);
            const sid = crypto_1.default.randomBytes(32).toString('hex');
            await p.query(`INSERT INTO sessions(id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '365 days')`, [
                sid,
                userId,
            ]);
            setSessionCookie(res, sid);
            return res.json({ ok: true, user: { id: userId, username } });
        }
        catch (e) {
            if (String(e?.message || '').includes('duplicate key')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            console.error('register error', e);
            return res.status(500).json({ error: `Register failed: ${String(e?.message || 'Unknown error')}` });
        }
    });
    app.post('/api/auth/login', async (req, res) => {
        try {
            await ensureSchema();
            const username = String(req.body?.username || '').trim();
            const password = String(req.body?.password || '');
            const p = getPool();
            const r = await p.query(`SELECT id, username, password_hash FROM users WHERE username = $1`, [username]);
            if (r.rowCount !== 1)
                return res.status(401).json({ error: 'Invalid username or password' });
            const row = r.rows[0];
            const ok = await bcryptjs_1.default.compare(password, String(row.password_hash));
            if (!ok)
                return res.status(401).json({ error: 'Invalid username or password' });
            const sid = crypto_1.default.randomBytes(32).toString('hex');
            await p.query(`INSERT INTO sessions(id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '365 days')`, [
                sid,
                Number(row.id),
            ]);
            setSessionCookie(res, sid);
            return res.json({ ok: true, user: { id: Number(row.id), username: String(row.username) } });
        }
        catch (e) {
            console.error('login error', e);
            return res.status(500).json({ error: 'Login failed' });
        }
    });
    app.post('/api/auth/logout', async (req, res) => {
        try {
            const sid = parseCookies(req)[COOKIE_NAME];
            if (sid)
                await getPool().query(`DELETE FROM sessions WHERE id = $1`, [sid]);
        }
        catch {
            // ignore
        }
        clearSessionCookie(res);
        return res.json({ ok: true });
    });
    app.get('/api/auth/status', async (req, res) => {
        try {
            const s = await getSession(req);
            return res.json({
                enabled: true,
                authenticated: Boolean(s),
                username: s?.username ?? null,
            });
        }
        catch {
            return res.json({ enabled: true, authenticated: false, username: null });
        }
    });
}
async function webAuthApiGuard(req, res, next) {
    if (!req.path.startsWith('/api/'))
        return next();
    if (req.path.startsWith('/api/auth/'))
        return next();
    const s = await getSession(req);
    if (!s) {
        res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
        return;
    }
    req.userId = s.userId;
    req.username = s.username;
    next();
}
function sendWebLoginPage(res) {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sign in</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0c1226;color:#e0f2fe;display:flex;min-height:100vh;align-items:center;justify-content:center}
form{background:#1e293b;padding:24px;border-radius:12px;min-width:320px;max-width:92vw;border:1px solid #1e3a5f;box-sizing:border-box}
label{display:block;font-size:14px;margin-bottom:6px}
input{width:100%;padding:10px 12px;margin:0 0 12px;border-radius:8px;border:1px solid #334155;background:#0c1226;color:#e0f2fe;box-sizing:border-box}
button{width:100%;padding:10px;border:0;border-radius:8px;background:#38bdf8;color:#0c1226;font-weight:600;cursor:pointer}
.muted{font-size:12px;color:#94a3b8;margin:8px 0}
#e{color:#f87171;font-size:14px;margin-top:10px;display:none}
h1{font-size:18px;margin:0 0 16px;text-align:center}
</style></head><body>
<form id="f"><h1>Better Calendar Tasks</h1>
<label for="u">Username</label><input id="u" autocomplete="username" required />
<label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required />
<button id="login" type="submit">Sign in</button>
<div class="muted">No account? Create one:</div>
<button id="register" type="button">Create account</button>
<p id="e"></p></form>
<script>
async function post(path, body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)})}
const f=document.getElementById('f'),e=document.getElementById('e'),u=document.getElementById('u'),p=document.getElementById('p');
f.addEventListener('submit', async function(ev){ev.preventDefault(); e.style.display='none';
  const r=await post('/api/auth/login',{username:u.value.trim(),password:p.value});
  if(r.ok){location.replace('/'); return;}
  let j={}; try{j=await r.json()}catch(x){} e.textContent=j.error||'Sign-in failed'; e.style.display='block';
});
document.getElementById('register').addEventListener('click', async function(){
  e.style.display='none';
  const r=await post('/api/auth/register',{username:u.value.trim(),password:p.value});
  if(r.ok){location.replace('/'); return;}
  let j={}; try{j=await r.json()}catch(x){} e.textContent=j.error||'Create account failed'; e.style.display='block';
});
</script></body></html>`;
    res.type('html').setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private').send(html);
}
async function isWebAuthenticated(req) {
    return Boolean(await getSession(req));
}
function registerWebDataRoutes(app) {
    app.get('/api/profiles', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        await ensureDefaultProfile(s.userId);
        const r = await getPool().query(`SELECT id, name, created_at AS "createdAt" FROM profiles WHERE user_id = $1 ORDER BY created_at ASC`, [s.userId]);
        return res.json(r.rows);
    });
    app.put('/api/profiles/:profileId', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const id = String(req.params.profileId || '').trim();
        const name = String(req.body?.name || '').trim();
        if (!id || !name)
            return res.status(400).json({ error: 'Invalid profile/name' });
        await getPool().query(`UPDATE profiles SET name = $1 WHERE user_id = $2 AND id = $3`, [name, s.userId, id]);
        return res.json({ ok: true });
    });
    app.delete('/api/profiles/:profileId', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const id = String(req.params.profileId || '').trim();
        await getPool().query(`DELETE FROM profiles WHERE user_id = $1 AND id = $2`, [s.userId, id]);
        await getPool().query(`DELETE FROM profile_ics WHERE user_id = $1 AND profile_id = $2`, [s.userId, id]);
        await getPool().query(`DELETE FROM custom_events WHERE user_id = $1 AND profile_id = $2`, [s.userId, id]);
        await getPool().query(`DELETE FROM user_state WHERE user_id = $1 AND profile_id = $2`, [s.userId, id]);
        return res.json({ ok: true });
    });
    app.post('/api/upload', upload.single('icsFile'), async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = String(req.body?.profileId || '').trim();
        const profileName = String(req.body?.profileName || '').trim();
        const isUpdate = String(req.body?.isUpdate || 'false') === 'true';
        const file = req.file;
        if (!profileId)
            return res.status(400).json({ error: 'profileId required' });
        if (!file?.buffer)
            return res.status(400).json({ error: 'icsFile required' });
        const icsText = file.buffer.toString('utf8');
        const p = getPool();
        const name = profileName || (profileId === DEFAULT_PROFILE_ID ? 'Default' : profileId);
        if (!isUpdate) {
            await p.query(`INSERT INTO profiles(user_id, id, name) VALUES ($1, $2, $3) ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name`, [s.userId, profileId, name]);
        }
        await p.query(`INSERT INTO profile_ics(user_id, profile_id, ics_text) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, profile_id) DO UPDATE SET ics_text = EXCLUDED.ics_text, updated_at = NOW()`, [s.userId, profileId, icsText]);
        return res.json({ ok: true, message: 'Uploaded', profileId });
    });
    app.get('/api/events', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = normalizeProfileId(req);
        const r = await getPool().query(`SELECT ics_text FROM profile_ics WHERE user_id = $1 AND profile_id = $2`, [s.userId, profileId]);
        if (r.rowCount !== 1)
            return res.json([]);
        try {
            return res.json(parseEventsFromIcsText(String(r.rows[0].ics_text)));
        }
        catch (e) {
            console.error('parse events error', e);
            return res.status(500).json({ error: 'Failed to parse calendar' });
        }
    });
    app.get('/api/custom-events', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = normalizeProfileId(req);
        const r = await getPool().query(`SELECT event_json FROM custom_events WHERE user_id = $1 AND profile_id = $2 ORDER BY uid ASC`, [s.userId, profileId]);
        return res.json(r.rows.map((x) => x.event_json));
    });
    app.post('/api/custom-events', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = normalizeProfileId(req);
        const uid = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            uid,
            title: String(req.body?.title || 'Untitled'),
            course: String(req.body?.course || 'My Tasks'),
            description: String(req.body?.description || ''),
            start: String(req.body?.start || new Date().toISOString()),
            end: req.body?.end ? String(req.body.end) : undefined,
            location: req.body?.location ? String(req.body.location) : undefined,
            url: req.body?.url ? String(req.body.url) : undefined,
        };
        await getPool().query(`INSERT INTO custom_events(user_id, profile_id, uid, event_json) VALUES ($1, $2, $3, $4::jsonb)`, [s.userId, profileId, uid, JSON.stringify(event)]);
        return res.json({ ok: true, event });
    });
    app.put('/api/custom-events/:uid', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = normalizeProfileId(req);
        const uid = String(req.params.uid || '');
        const existing = await getPool().query(`SELECT event_json FROM custom_events WHERE user_id = $1 AND profile_id = $2 AND uid = $3`, [s.userId, profileId, uid]);
        if (existing.rowCount !== 1)
            return res.status(404).json({ error: 'Not found' });
        const merged = { ...(existing.rows[0].event_json || {}), ...(req.body || {}), uid };
        await getPool().query(`UPDATE custom_events SET event_json = $4::jsonb WHERE user_id = $1 AND profile_id = $2 AND uid = $3`, [s.userId, profileId, uid, JSON.stringify(merged)]);
        return res.json({ ok: true });
    });
    app.delete('/api/custom-events/:uid', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = normalizeProfileId(req);
        const uid = String(req.params.uid || '');
        await getPool().query(`DELETE FROM custom_events WHERE user_id = $1 AND profile_id = $2 AND uid = $3`, [
            s.userId,
            profileId,
            uid,
        ]);
        return res.json({ ok: true });
    });
    const stateKeys = [
        'completed',
        'notes',
        'initialized',
        'course-colors',
        'course-visibility',
        'course-order',
        'theme',
    ];
    for (const key of stateKeys) {
        app.get(`/api/user-state/${key}`, async (req, res) => {
            const s = await requireUser(req);
            if (!s)
                return res.status(401).json({ error: 'Unauthorized' });
            const profileId = normalizeProfileId(req);
            const r = await getPool().query(`SELECT value FROM user_state WHERE user_id = $1 AND profile_id = $2 AND key = $3`, [s.userId, profileId, key]);
            if (r.rowCount !== 1)
                return res.json(key === 'initialized' ? { initialized: false } : {});
            return res.json(r.rows[0].value);
        });
        app.put(`/api/user-state/${key}`, async (req, res) => {
            const s = await requireUser(req);
            if (!s)
                return res.status(401).json({ error: 'Unauthorized' });
            const profileId = normalizeProfileId(req);
            await getPool().query(`INSERT INTO user_state(user_id, profile_id, key, value) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, profile_id, key) DO UPDATE SET value = EXCLUDED.value`, [s.userId, profileId, key, JSON.stringify(req.body ?? {})]);
            return res.json({ ok: true });
        });
    }
    app.get('/api/user-state/profile', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const r = await getPool().query(`SELECT current_profile_id FROM users WHERE id = $1`, [s.userId]);
        return res.json({ profileId: r.rows[0]?.current_profile_id || DEFAULT_PROFILE_ID });
    });
    app.put('/api/user-state/profile', async (req, res) => {
        const s = await requireUser(req);
        if (!s)
            return res.status(401).json({ error: 'Unauthorized' });
        const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID);
        await getPool().query(`UPDATE users SET current_profile_id = $1 WHERE id = $2`, [profileId, s.userId]);
        return res.json({ ok: true });
    });
}
