import { fileURLToPath } from 'node:url';
import base from './norman-fall.vite.mjs';
export default {
  ...base,
  resolve: { alias: {
    'next/server': fileURLToPath(new URL('./fixtures/closed-jobs-next-server.ts', import.meta.url)),
    ...base.resolve.alias,
  } },
};
