import { auth } from '../firebase/admin';

/**
 * Extracts and verifies a Firebase ID token from the Authorization header.
 * Returns the decoded UID on success, or null if the header is missing or invalid.
 */
export async function verifyAuthHeader(authorizationHeader: string | undefined): Promise<string | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const idToken = authorizationHeader.slice('Bearer '.length);
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}
