import * as dotenv from 'dotenv';

if (process.env.FUNCTIONS_EMULATOR) {
  dotenv.config({ path: '.env.local' });
}
