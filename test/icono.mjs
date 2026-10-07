// Genera paquete/icon.png (512×512, fondo transparente) a partir de un SVG original.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Playwright no es dependencia del proyecto: instálalo aparte (npm i -D playwright) o indica su ruta en PLAYWRIGHT_PATH.
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  if (!process.env.PLAYWRIGHT_PATH) { console.error('Hace falta Playwright: npm i -D playwright (o PLAYWRIGHT_PATH=<ruta del módulo>)'); process.exit(2); }
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH));
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9643a"/><stop offset="1" stop-color="#9c4322"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#f)"/>
  <!-- bocadillo de atrás (hermano 2) -->
  <path d="M236 150h150a48 48 0 0 1 48 48v96a48 48 0 0 1-48 48h-14v54l-62-54h-74a48 48 0 0 1-48-48v-96a48 48 0 0 1 48-48z" fill="#f6d3c2"/>
  <!-- bocadillo de delante (hermano 1) -->
  <path d="M126 196h160a48 48 0 0 1 48 48v92a48 48 0 0 1-48 48h-96l-66 58v-58h0a48 48 0 0 1-46-48v-92a48 48 0 0 1 48-48z" fill="#ffffff"/>
  <!-- saludo: dos puntos y una sonrisa -->
  <circle cx="176" cy="276" r="17" fill="#9c4322"/>
  <circle cx="236" cy="276" r="17" fill="#9c4322"/>
  <path d="M168 322q38 30 76 0" fill="none" stroke="#9c4322" stroke-width="16" stroke-linecap="round"/>
</svg>`;

const nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pag = await nav.newPage({ viewport: { width: 512, height: 512 } });
await pag.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await pag.screenshot({ path: process.argv[2] || 'paquete/icon.png', omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
await nav.close();
console.log('icono generado');
