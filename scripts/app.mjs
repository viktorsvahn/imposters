// Start the desktop app: `npm run app` (built files) or `npm run app:dev`
// (Vite dev server with live reload). Compiles the Electron main process first.

import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';

const dev = process.argv.includes('--dev');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // set by VS Code; it would start Electron as plain Node

const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.json'], { stdio: 'inherit' });
if (tsc.status) process.exit(tsc.status);

let server = null;
if (dev) {
  const { createServer } = await import('vite');
  server = await createServer();
  await server.listen();
  env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
}

const args = ['.', ...process.argv.slice(2).filter((a) => a !== '--dev')];
spawn(electron, args, { stdio: 'inherit', env }).on('exit', async (code) => {
  await server?.close();
  process.exit(code ?? 0);
});
