import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { config } from '../config';

export { WebhookVerificationError };

const wh = new Webhook(config.dodoWebhookSecret);

export function verifyWebhookSignature(
  rawBody: string,
  headers: {
    'webhook-id': string;
    'webhook-timestamp': string;
    'webhook-signature': string;
  }
): void {
  wh.verify(rawBody, headers);
}
