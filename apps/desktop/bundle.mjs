// Turn the workspace into three things the packaged app can hold:
//   build/main.cjs    the shell
//   build/server.cjs  the server, with everything it imports folded in
//   web/              the pages, copied from the Vite build
// Nothing here type-checks; "npm run check" does that.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, '..', 'web', 'dist');
const webOut = join(here, 'web');

if (!existsSync(webSrc)) {
  console.error('apps/web/dist is missing. Run "npm run build" first.');
  process.exit(1);
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',          // Electron 44 carries Node 22
  logLevel: 'info',
  logOverride: { 'require-resolve-not-external': 'silent', 'empty-import-meta': 'silent' },
};

// electron is provided by the runtime; server.cjs is built separately and required at startup,
// after the shell has set the environment it reads.
await build({
  ...common,
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(here, 'build', 'main.cjs'),
  external: ['electron', './server.cjs'],
});

await build({
  ...common,
  entryPoints: [join(here, '..', 'server', 'src', 'index.ts')],
  outfile: join(here, 'build', 'server.cjs'),
  external: ['electron', 'bufferutil', 'utf-8-validate'],   // ws asks for these, works without
});

rmSync(webOut, { recursive: true, force: true });
mkdirSync(webOut, { recursive: true });
cpSync(webSrc, webOut, { recursive: true });
console.log('bundled the shell, the server and the pages');
