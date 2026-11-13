import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  user_id: number;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'staff' | 'chef';
  is_active: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  authTokenHash?: string;
}

export const AUTH_COOKIE_NAME = 'dineeasy_session';
const TOKEN_TTL_HOURS = 24 * 7;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function hashToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'dineeasy-dev-secret-key';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function createAuthSession(userId: number, rememberMe = false): { token: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const hours = rememberMe ? 24 * 30 : TOKEN_TTL_HOURS;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    userId,
    expiresAt
  );

  return { token: rawToken, expiresAt };
}

export function deleteAuthSession(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function resolveAuthUser(req: Request): AuthUser | null {
  const rawToken = extractTokenFromRequest(req);
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.user_id, u.name, u.username, u.email, u.role, u.is_active, s.expires_at
       FROM auth_sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

  if (!row) return null;
  if (!row.is_active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    user_id: row.user_id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...allowedRoles: Array<'admin' | 'staff' | 'chef'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    req.user = user;
    next();
  };
}

export function logAudit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: string | number,
  details: Record<string, unknown> = {},
  ipAddress = ''
): void {
  try {
    db.prepare(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, action, entityType, String(entityId), JSON.stringify(details), ipAddress);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Simple in-memory sliding window rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}
