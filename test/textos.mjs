// Comprueba que los textos en español e inglés tienen las mismas claves y que el código
// no usa ninguna clave que no exista.
import fs from 'node:fs';
import { ES, EN } from '../src/textos.js';

let fallos = 0;
const kES = new Set(Object.keys(ES));
const kEN = new Set(Object.keys(EN));
for (const k of kES) if (!kEN.has(k)) { console.log(`✗ falta en EN: ${k}`); fallos++; }
for (const k of kEN) if (!kES.has(k)) { console.log(`✗ falta en ES: ${k}`); fallos++; }

const usadas = new Set();
for (const f of ['src/herramientas.js', 'src/almacen.js', 'src/visor.js', 'src/avisos.js', 'src/index.js']) {
  if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\bT\.([a-zA-Z_][a-zA-Z0-9_]*)\(/g)) usadas.add(m[1]);
}
for (const k of usadas) if (!kES.has(k)) { console.log(`✗ el código usa una clave inexistente: ${k}`); fallos++; }
for (const k of kES) if (!usadas.has(k)) console.log(`· clave sin uso (aviso): ${k}`);
console.log(fallos ? `${fallos} FALLOS` : `textos OK: ${kES.size} claves en ES y EN; ${usadas.size} usadas en el código`);
process.exit(fallos ? 1 : 0);
