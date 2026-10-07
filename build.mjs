// Empaqueta hey Bro! en un solo archivo JS (sin node_modules) dentro de paquete/server/.
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('paquete/server', { recursive: true, force: true });
await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'paquete/server/index.cjs',
  loader: { '.html': 'text' },
  legalComments: 'inline',
  minify: false,
  logLevel: 'warning',
});
const kb = (fs.statSync('paquete/server/index.cjs').size / 1024).toFixed(0);
console.log(`paquete/server/index.cjs · ${kb} KB`);
