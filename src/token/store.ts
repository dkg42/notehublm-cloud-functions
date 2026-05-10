import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { saveUserToken } from '../firebase/firestore';
import { verifyAuthHeader } from './verify-firebase-token';

interface StoreTokenBody {
  refreshToken?: string;
  scope?: string;
}

export async function storeGoogleTokenHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uid = await verifyAuthHeader(req.headers.authorization);
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { refreshToken, scope } = req.body as StoreTokenBody;

  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  await saveUserToken(uid, refreshToken, scope ?? '');
  logger.info('[storeGoogleToken] Token stored', { uid });
  res.json({ success: true });
}
