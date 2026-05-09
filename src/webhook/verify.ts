import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { dodoWebhookSecret } from '../config';

export { WebhookVerificationError };

export function verifyWebhookSignature(
  rawBody: string,
  headers: {
    'webhook-id': string;
    'webhook-timestamp': string;
    'webhook-signature': string;
  }
): void {
  const wh = new Webhook(dodoWebhookSecret.value());
  wh.verify(rawBody, headers);
}
