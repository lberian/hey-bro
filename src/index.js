// Punto de entrada: servidor MCP por stdio + visor web local + avisos al moderador.

import os from 'node:os';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Almacen } from './almacen.js';
import { crearHerramientas } from './herramientas.js';
import { detectarIdioma } from './i18n.js';
import { textos } from './textos.js';
import { Visor } from './visor.js';
import HTML from './visor.html';

export const VERSION = '0.2.0';

// Lee una opción de entorno. Claude Desktop sustituye ${user_config.x}; si el usuario dejó
// el campo vacío puede llegar el texto literal "${...}": se trata como no configurado.
function opcion(nombre, porDefecto) {
  const v = process.env[nombre];
  if (v === undefined || v === null) return porDefecto;
  const t = String(v).trim();
  if (!t || t.includes('${')) return porDefecto;
  return t;
}
const siNo = (v, def) => (v === undefined ? def : !/^(no|false|0|off|desactivad[oa]s?)$/i.test(String(v)));

async function main() {
  const idioma = detectarIdioma(opcion('HEYBRO_IDIOMA', 'auto'));
  const T = textos(idioma);
  const carpeta = path.resolve(opcion('HEYBRO_CARPETA', path.join(os.homedir(), 'HeyBro')));
  const almacen = new Almacen({
    carpeta,
    moderador: opcion('HEYBRO_MODERADOR', idioma === 'en' ? 'Moderator' : 'Moderador'),
    limitePorDefecto: Number(opcion('HEYBRO_LIMITE', '40')) || 40,
    inactividadMin: Number(opcion('HEYBRO_INACTIVIDAD_MIN', '15')) || 15,
    archivarDias: Number(opcion('HEYBRO_ARCHIVAR_DIAS', '7')) || 7,
    T,
  });
  const ctx = { almacen, visor: null, T, idioma };
  const herramientas = crearHerramientas(ctx);
  ctx.visor = new Visor(ctx, {
    puerto: Number(opcion('HEYBRO_PUERTO', '4520')) || 4520,
    html: HTML,
    version: VERSION,
    avisos: siNo(opcion('HEYBRO_AVISOS', undefined), true),
    formatearTablero: herramientas.formatearTablero,
    hora: herramientas.hora,
  });
  if (opcion('HEYBRO_SIN_VISOR', '') !== '1') {
    ctx.visor.asegurar().catch(() => {});
    setInterval(() => { ctx.visor.asegurar().catch(() => {}); }, 30_000).unref();
  }

  const server = new Server(
    { name: 'hey-bro', version: VERSION },
    { capabilities: { tools: {} }, instructions: herramientas.INSTRUCCIONES },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: herramientas.DEFINICIONES }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const token = request.params?._meta?.progressToken;
    const progreso = token !== undefined
      ? (hechos, total) => {
        extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress: hechos, total, message: idioma === 'en' ? 'Waiting for news from your siblings…' : 'Esperando novedades de tus hermanos…' },
        }).catch(() => {});
      }
      : null;
    return herramientas.ejecutar(request.params.name, request.params.arguments, { signal: extra.signal, progreso });
  });

  server.onclose = () => process.exit(0);
  process.stdin.on('end', () => process.exit(0));
  await server.connect(new StdioServerTransport());
  console.error(`[hey-bro] v${VERSION} · ${idioma} · ${carpeta}`);
}

main().catch((e) => {
  console.error('[hey-bro] error fatal:', e);
  process.exit(1);
});
