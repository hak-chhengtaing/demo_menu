import { Router } from 'express';
import { db } from '../db.ts';
import {
  AUTH_COOKIE_NAME,
  createAuthSession,
  deleteAuthSession,
  extractTokenFromRequest,
  logAudit,
  rateLimit,
  resolveAuthUser,
  verifyPassword,
} from '../auth.ts';

const router = Router();

router.post('/login', rateLimit(20, 60 * 1000), (req, res) => {
  const { identifier, username, email, password, remember_me } = req.body as {
    identifier?: string;
    username?: string;
    email?: string;
    password?: string;
    remember_me?: boolean;
  };

  const loginKey = (identifier || username || email || '').trim().toLowerCase();
  if (!loginKey || !password) {
    res.status(400).json({ error: 'Username/email and password are required.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT user_id, name, username, email, password_hash, role, is_active
       FROM users
       WHERE LOWER(username) = ? OR LOWER(email) = ?`
    )
    .get(loginKey, loginKey) as
    | {
        user_id: number;
        name: string;
        username: string;
        email: string;
        password_hash: string;
        role: 'admin' | 'staff' | 'chef';
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    logAudit(null, 'auth:login_failed', 'user', loginKey, { reason: 'invalid_credentials' }, req.ip || '');
    res.status(401).json({ error: 'Invalid credentials. Please check your username and password.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
    return;
  }

  const { token, expiresAt } = createAuthSession(user.user_id, Boolean(remember_me));
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE user_id = ?").run(user.user_id);
  logAudit(user.user_id, 'auth:login_success', 'user', user.user_id, { role: user.role }, req.ip || '');

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  });

  res.json({
    token,
    expires_at: expiresAt,
    user: {
      user_id: user.user_id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

router.post('/logout', (req, res) => {
  const token = extractTokenFromRequest(req);
  const user = resolveAuthUser(req);
  if (token) {
    deleteAuthSession(token);
  }
  if (user) {
    logAudit(user.user_id, 'auth:logout', 'user', user.user_id, {}, req.ip || '');
  }
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const user = resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user });
});

export default router;
