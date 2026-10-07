// Prepara los archivos de una versión en dist/:
//   hey-bro-<versión>.mcpb       la extensión para Claude Desktop
//   hey-bro-skill-en.zip / -es   la skill en inglés y en español, lista para subir a Claude
// Uso: node scripts/empaquetar.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(raiz);

// 1. Las tres versiones deben coincidir.
const vPaquete = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const vManifiesto = JSON.parse(fs.readFileSync('paquete/manifest.json', 'utf8')).version;
const vServidor = /export const VERSION = '([^']+)'/.exec(fs.readFileSync('src/index.js', 'utf8'))?.[1];
if (vPaquete !== vManifiesto || vPaquete !== vServidor) {
  console.error(`Versiones distintas: package.json ${vPaquete} · manifest.json ${vManifiesto} · src/index.js ${vServidor}`);
  process.exit(1);
}

// 2. Compilar, validar y empaquetar la extensión.
const mcpb = path.join('node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
const node = (...args) => execFileSync(process.execPath, args, { stdio: 'inherit' });
fs.mkdirSync('dist', { recursive: true });
node('build.mjs');
node(mcpb, 'validate', 'paquete/manifest.json');
const salida = path.join('dist', `hey-bro-${vPaquete}.mcpb`);
fs.rmSync(salida, { force: true });
node(mcpb, 'pack', 'paquete', salida);

// 3. Las skills, cada una en un zip con su carpeta «hey-bro/».
const TABLA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(entradas) { // entradas: [{ nombre, datos: Buffer | null (carpeta) }]
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, 'utf8');
    const carpeta = datos === null;
    const crudo = carpeta ? Buffer.alloc(0) : datos;
    const comprimido = carpeta ? Buffer.alloc(0) : zlib.deflateRawSync(crudo, { level: 9 });
    const crc = carpeta ? 0 : crc32(crudo);
    const metodo = carpeta ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8); local.writeUInt16LE(hora, 10); local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    locales.push(local, n, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(metodo, 10); central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(fecha, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(crudo.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(carpeta ? 0x10 : 0, 38); central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, n);
    desplazamiento += local.length + n.length + comprimido.length;
  }
  const cd = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(0, 4); fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(desplazamiento, 16); fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locales, cd, fin]);
}
for (const idioma of ['en', 'es']) {
  const skill = fs.readFileSync(path.join('skill', idioma, 'hey-bro', 'SKILL.md'));
  const destino = path.join('dist', `hey-bro-skill-${idioma}.zip`);
  fs.writeFileSync(destino, zip([{ nombre: 'hey-bro/', datos: null }, { nombre: 'hey-bro/SKILL.md', datos: skill }]));
  console.log(`${destino} · ${skill.length} bytes`);
}
console.log(`\nListo: dist/ contiene la versión ${vPaquete}.`);
