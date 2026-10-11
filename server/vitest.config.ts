import { defineConfig } from 'vitest/config';

// Server tests only (Node environment, no network): `npm run server:test`.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['test/**/*.spec.ts'],
    environment: 'node',
  },
});
