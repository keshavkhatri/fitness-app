// Bundles the API server, the migration tool, the unconfirmed-account cleanup job and the email test command, each into one
// file (server/dist/*.mjs). Run with `npm run build` here, or `npm run server:build` from the repository root.
import { build } from 'esbuild';

await build({
  entryPoints: { main: 'src/main.ts', migrate: 'tools/migrate.ts', cleanup: 'tools/cleanup.ts', 'email-test': 'tools/email-test.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // pg's optional native binding is not used (and not installed).
  external: ['pg-native'],
  // pg is CommonJS: bundled into an ES module it needs require() for Node's built-in modules.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});
