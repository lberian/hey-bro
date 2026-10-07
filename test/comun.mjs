// Utilidades comunes de las pruebas de extremo a extremo.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearPrueba() {
  const estado = { fallos: 0, pruebas: 0 };
  const ok = (cond, nombre, extra = '') => {
    estado.pruebas++;
    if (cond) console.log(`  ✓ ${nombre}`);
    else { estado.fallos++; console.log(`  ✗ ${nombre}${extra ? `\n      ${String(extra).slice(0, 700).replace(/\n/g, '\n      ')}` : ''}`); }
  };
  const fin = () => {
    console.log(`\n${estado.pruebas - estado.fallos}/${estado.pruebas} comprobaciones correctas${estado.fallos ? ` · ${estado.fallos} FALLOS` : ''}`);
    process.exit(estado.fallos ? 1 : 0);
  };
  return { ok, fin, estado };
}

export function carpetaTemporal(prefijo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefijo));
}

export async function sesion({ servidor, carpeta, puerto, idioma, moderador, extraEnv = {} }) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [servidor],
    env: { ...process.env, HEYBRO_CARPETA: carpeta, HEYBRO_PUERTO: String(puerto), HEYBRO_MODERADOR: moderador, HEYBRO_IDIOMA: idioma, HEYBRO_AVISOS_SIMULAR: '1', ...extraEnv },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'prueba', version: '1.0.0' });
  await client.connect(transport);
  const llamar = async (tool, args, opciones) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, opciones);
    return { texto: r.content.map((c) => c.text).join('\n'), error: !!r.isError };
  };
  return { client, llamar, cerrar: () => client.close() };
}

export function peticion(puerto, metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo ? JSON.stringify(cuerpo) : null;
    const req = http.request({
      host: '127.0.0.1', port: puerto, method: metodo, path: ruta,
      headers: { Host: `127.0.0.1:${puerto}`, ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {}), ...cabeceras },
    }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* texto */ } resolve({ estado: res.statusCode, json: j, texto: t, cabeceras: res.headers }); });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// Escribe a mano una entrada en el registro de una sala (para simular el paso del tiempo).
export function inyectar(carpeta, sala, entrada) {
  const dir = path.join(carpeta, 'salas', sala, 'registro');
  const n = Math.max(0, ...fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseInt(f, 10))) + 1;
  fs.writeFileSync(path.join(dir, `${String(n).padStart(6, '0')}.json`), JSON.stringify({ n, ...entrada }));
  return n;
}

// Crea a mano una sala antigua (para probar el archivo automático y las salas huérfanas).
export function salaAntigua(carpeta, { id, tema, quien, texto, dias }) {
  const dir = path.join(carpeta, 'salas', id);
  fs.mkdirSync(path.join(dir, 'registro'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'presencia'), { recursive: true });
  const t = new Date(Date.now() - dias * 86_400_000).toISOString();
  fs.writeFileSync(path.join(dir, 'sala.json'), JSON.stringify({ id, tema, objetivo: '', creada: t, creador: quien, limite_inicial: 40, invitacion: `Invitación a ${id}`, version: 2 }));
  const reg = (n, e) => fs.writeFileSync(path.join(dir, 'registro', `${String(n).padStart(6, '0')}.json`), JSON.stringify({ n, t, ...e }));
  reg(1, { tipo: 'sala', accion: 'creada', de: quien });
  reg(2, { tipo: 'union', de: quien, ficha: { tipo_sesion: 'Cowork', papel: 'pregunta', mision: 'm', capacidades: 'c', limites: 'l' }, dossier: 'Dossier de prueba con suficiente texto para pasar el mínimo.' });
  reg(3, { tipo: 'mensaje', de: quien, clase: 'pregunta', texto, para: null });
}
