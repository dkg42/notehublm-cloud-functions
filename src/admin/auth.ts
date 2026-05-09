import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { createHash, timingSafeEqual } from 'crypto';

export function checkAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env['ADMIN_SECRET'];
  if (!secret) {
    logger.error('[admin] ADMIN_SECRET environment variable is not set');
    res.status(500).json({ error: 'Server misconfiguration' });
    return false;
  }
  const provided = (req.headers['x-admin-secret'] as string | undefined) ?? '';
  const providedHash = createHash('sha256').update(provided).digest();
  const secretHash = createHash('sha256').update(secret).digest();
  if (!timingSafeEqual(providedHash, secretHash)) {
    logger.warn('[admin] Unauthorized admin request');
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
