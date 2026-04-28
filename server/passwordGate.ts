import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'bct_session';
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

/** Fixed app access password (no env setup). */
const ACCESS_PASSWORD = '0117';

let sessionSecret: string | null = null;
let passwordHash: Buffer | null = null;

export function initPasswordAuth(userDataPath: string): void {
  passwordHash = crypto.createHash('sha256').update(ACCESS_PASSWORD, 'utf8').digest();

  const secretPath = path.join(userDataPath, '.bct-session-secret');
  if (fs.existsSync(secretPath)) {
    sessionSecret = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(secretPath, sessionSecret, { mode: 0o600 });
  }
}

export function isPasswordAuthEnabled(): boolean {
  return passwordHash !== null && sessionSecret !== null;
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function createToken(): string {
  if (!sessionSecret) throw new Error('Session secret not initialized');
  const exp = Math.floor(Date.now() / 1000) + ONE_YEAR_SEC;
  const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token || !sessionSecret) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number };
    return typeof data.exp === 'number' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isAuthenticated(req: Request): boolean {
  if (!isPasswordAuthEnabled()) return true;
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

function setAuthCookie(res: Response, token: string): void {
  const secure = process.env.COOKIE_SECURE === '1';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${ONE_YEAR_SEC}`,
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res: Response): void {
  const secure = process.env.COOKIE_SECURE === '1';
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function checkLoginPassword(password: string): boolean {
  if (!passwordHash) return false;
  const h = crypto.createHash('sha256').update(password, 'utf8').digest();
  if (h.length !== passwordHash.length) return false;
  return crypto.timingSafeEqual(h, passwordHash);
}

export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth/login', (req, res) => {
    if (!isPasswordAuthEnabled()) {
      return res.json({ ok: true, enabled: false });
    }
    const password = req.body?.password;
    if (typeof password !== 'string' || !checkLoginPassword(password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const token = createToken();
    setAuthCookie(res, token);
    return res.json({ ok: true, enabled: true });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  app.get('/api/auth/status', (req, res) => {
    return res.json({
      enabled: isPasswordAuthEnabled(),
      authenticated: isAuthenticated(req),
    });
  });
}

export function passwordAuthApiGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isPasswordAuthEnabled()) {
    next();
    return;
  }
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }
  if (req.path.startsWith('/api/auth/')) {
    next();
    return;
  }
  if (isAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
}

export function sendLoginPage(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0c1226;color:#e0f2fe;display:flex;min-height:100vh;align-items:center;justify-content:center}
    form{background:#1e293b;padding:24px;border-radius:12px;min-width:300px;max-width:90vw;border:1px solid #1e3a5f;box-sizing:border-box}
    label{display:block;font-size:14px;margin-bottom:6px}
    input{width:100%;padding:10px 12px;margin:0 0 12px;border-radius:8px;border:1px solid #334155;background:#0c1226;color:#e0f2fe;box-sizing:border-box}
    button{width:100%;padding:10px;border:0;border-radius:8px;background:#38bdf8;color:#0c1226;font-weight:600;cursor:pointer}
    #e{color:#f87171;font-size:14px;margin-top:10px;display:none}
    h1{font-size:18px;margin:0 0 16px;text-align:center}
  </style>
</head>
<body>
  <form id="f">
    <h1>Better Calendar Tasks</h1>
    <label for="p">Password</label>
    <input id="p" type="password" autocomplete="current-password" required />
    <button type="submit">Continue</button>
    <p id="e"></p>
  </form>
  <script>
    document.getElementById('f').addEventListener('submit', async function (e) {
      e.preventDefault();
      var el = document.getElementById('e');
      el.style.display = 'none';
      var p = document.getElementById('p').value;
      var r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: p })
      });
      if (r.ok) {
        var s = await fetch('/api/auth/status', { credentials: 'include' });
        var sj = {};
        try { sj = await s.json(); } catch (x) {}
        if (sj && sj.authenticated) {
          location.replace('/');
          return;
        }
        el.textContent = window.location.protocol === 'http:'
          ? 'Password accepted, but session cookie was not stored. Open this app with https:// and try again.'
          : 'Password accepted, but session was not established. Check browser cookie/privacy settings and try again.';
        el.style.display = 'block';
      } else {
        var j = {};
        try { j = await r.json(); } catch (x) {}
        el.textContent = j.error || 'Sign-in failed';
        el.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
  res.type('html').send(html);
}
