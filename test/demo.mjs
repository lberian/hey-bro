// Salas de ejemplo (datos neutros) + capturas del visor para el README.
// Uso: node test/demo.mjs <carpeta-salida> <es|en>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { dormir, peticion, salaAntigua, sesion } from './comun.mjs';

const require = createRequire(import.meta.url);
// Playwright no es dependencia del proyecto: instálalo aparte (npm i -D playwright) o indica su ruta en PLAYWRIGHT_PATH.
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  if (!process.env.PLAYWRIGHT_PATH) { console.error('Hace falta Playwright: npm i -D playwright (o PLAYWRIGHT_PATH=<ruta del módulo>)'); process.exit(2); }
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH));
}

const SALIDA = process.argv[2] || '/tmp/capturas';
const IDIOMA = process.argv[3] === 'en' ? 'en' : 'es';
const EN = IDIOMA === 'en';
fs.mkdirSync(SALIDA, { recursive: true });
const CARPETA = path.join('/tmp', `demo-${IDIOMA}`, 'HeyBro');
fs.rmSync(path.dirname(CARPETA), { recursive: true, force: true });
fs.mkdirSync(CARPETA, { recursive: true });
const PUERTO = EN ? 4631 : 4630;
const MOD = EN ? 'Alex' : 'Ana';
const L = (es, en) => (EN ? en : es);
const textos = {};

const conf = { servidor: 'paquete/server/index.cjs', carpeta: CARPETA, puerto: PUERTO, idioma: IDIOMA, moderador: MOD, extraEnv: { HEYBRO_AVISOS: '0' } };
async function hermano() {
  const s = await sesion(conf);
  const f = async (tool, args) => {
    const r = await s.llamar(tool, args);
    if (r.error) throw new Error(`${tool}: ${r.texto}`);
    return r.texto;
  };
  f.cerrar = s.cerrar;
  f.client = s.client;
  return f;
}

// ── nombres y textos ──
const RED = L('Redactor', 'Writer');
const REV = L('Revisor', 'Reviewer');
const PRO = L('Programador', 'Developer');
const SALA = L('lanzamiento-web', 'website-launch');

const R = await hermano();
const V = await hermano();
const P = await hermano();

textos.crear = await R('bro_crear_sala', {
  nombre: SALA,
  tema: L('Lanzamiento de la web', 'Website launch'),
  objetivo: L('Publicar la web nueva el viernes, con los textos revisados y sin enlaces rotos', 'Ship the new website on Friday, with reviewed copy and no broken links'),
  papel_invitado: L('revisar tono y ortografía de los textos', 'review tone and spelling of the copy'),
  yo: RED,
  ficha: {
    tipo_sesion: 'Cowork',
    papel: L('Escribe los textos de la web', 'Writes the website copy'),
    mision: L('Redactar la portada, «Quiénes somos» y la página de precios', 'Write the home page, "About us" and the pricing page'),
    capacidades: L('Carpeta del proyecto conectada; edito Markdown y HTML', 'Project folder connected; I edit Markdown and HTML'),
    limites: L(`No publico nada sin el OK de ${MOD}`, `I publish nothing without ${MOD}'s OK`),
    necesito: L('Alguien que revise el tono y la ortografía', 'Someone to review tone and spelling'),
    ofrezco: L('Textos finales y capturas', 'Final copy and screenshots'),
    estado: L('Portada terminada; con «Quiénes somos»', 'Home page done; working on "About us"'),
    disponibilidad: L('escucha activa', 'active listening'),
  },
  dossier: L(
    `# Contexto del Redactor\n\n**Petición de ${MOD} (literal):** «Prepara los textos de la web nueva; salimos el viernes».\n\n## Hecho\n- Portada en \`web/index.md\` (320 palabras).\n\n## Decisiones\n- Tuteo en toda la web.\n- Frases cortas; nada de jerga.\n\n## Pendiente\n- «Quiénes somos».\n- Página de precios.`,
    `# Writer's context\n\n**${MOD}'s request (verbatim):** "Get the copy for the new website ready; we ship on Friday."\n\n## Done\n- Home page in \`web/index.md\` (320 words).\n\n## Decisions\n- Friendly, informal tone across the site.\n- Short sentences; no jargon.\n\n## Pending\n- "About us".\n- Pricing page.`),
});

textos.unirseRevisor = await V('bro_unirse', {
  sala: SALA, yo: REV,
  ficha: {
    tipo_sesion: L('Chat de Claude Desktop', 'Claude Desktop chat'),
    papel: L('Revisa tono, ortografía y coherencia', 'Reviews tone, spelling and consistency'),
    mision: L('Dejar los textos listos para publicar', 'Get the copy ready to publish'),
    capacidades: L('Lectura atenta; guía de estilo en el proyecto del chat', 'Careful reading; style guide in the chat project'),
    limites: L('No edito archivos del PC; trabajo por turnos', 'I cannot edit files on the PC; I work turn by turn'),
    disponibilidad: L('por turnos (chat)', 'turn-based (chat)'),
  },
  dossier: L(
    `# Contexto del Revisor\n\n**Petición de ${MOD}:** «Revisa que todo suene igual y sin erratas».\n\n- La guía de estilo pide tuteo y frases de menos de 25 palabras.\n- «Correo electrónico», no «email».`,
    `# Reviewer's context\n\n**${MOD}'s request:** "Make sure everything sounds consistent and has no typos."\n\n- The style guide asks for an informal tone and sentences under 25 words.\n- "Email", not "e-mail".`),
});

await V('bro_enviar', {
  sala: SALA, yo: REV, para: RED, clase: 'respuesta',
  texto: L(
    'Te entiendo así:\n1. Tú escribes portada, «Quiénes somos» y precios (tuteo, frases cortas).\n2. Yo reviso cada página cuando la marques como lista.\n\n¿Correcto?',
    'My read-back:\n1. You write the home page, "About us" and pricing (informal, short sentences).\n2. I review each page once you mark it ready.\n\nCorrect?'),
});
await R('bro_esperar', { sala: SALA, yo: RED, segundos: 0 });
await R('bro_enviar', { sala: SALA, yo: RED, para: REV, clase: 'respuesta', texto: L('Correcto. La portada ya está en `web/index.md`: empieza por ahí.', 'Correct. The home page is already in `web/index.md`: start there.') });

const encargo = await R('bro_enviar', {
  sala: SALA, yo: RED, para: REV, clase: 'encargo',
  titulo: L('Revisar la portada', 'Review the home page'),
  origen: L('que alguien revise el tono y la ortografía antes del viernes', 'someone should review tone and spelling before Friday'),
  texto: L(
    '1. Lee `web/index.md`.\n2. Corrige erratas y marca dudas de tono.\n\n**Terminado cuando:** me devuelvas la lista de cambios.',
    '1. Read `web/index.md`.\n2. Fix typos and flag tone doubts.\n\n**Done when:** you send me the list of changes.'),
});
const T1 = /(T\d+)/.exec(encargo)[1];
await V('bro_esperar', { sala: SALA, yo: REV, segundos: 0 });
await V('bro_tablero', { sala: SALA, yo: REV, cambiar: { id: T1, estado: 'en_curso' } });

textos.unirseProgramador = await P('bro_unirse', {
  sala: SALA, yo: PRO,
  ficha: {
    tipo_sesion: 'Claude Code',
    papel: L('Monta la web y comprueba los enlaces', 'Builds the site and checks the links'),
    mision: L('Generar el sitio estático y pasar el comprobador de enlaces', 'Build the static site and run the link checker'),
    capacidades: L('Terminal en el PC: npm, git y el generador del sitio', 'Terminal on the PC: npm, git and the site generator'),
    limites: L(`No despliego en producción sin el OK de ${MOD}`, `I never deploy to production without ${MOD}'s OK`),
    disponibilidad: L('de guardia: ronda cada 3 min', 'on call: checks every 3 min'),
  },
  dossier: L(
    `# Contexto del Programador\n\n**Petición de ${MOD}:** «Monta la web y que no haya ni un enlace roto».\n\n- Generador: sitio estático en \`web/\`.\n- \`npm run build\` tarda unos 4 min y usa toda la CPU.`,
    `# Developer's context\n\n**${MOD}'s request:** "Build the site and make sure there is not a single broken link."\n\n- Generator: static site in \`web/\`.\n- \`npm run build\` takes about 4 min and uses the whole CPU.`),
});

await R('bro_tablero', { sala: SALA, yo: RED, nuevo: { tipo: 'reserva', titulo: L('web/quienes-somos.md', 'web/about-us.md'), modo: 'exclusiva' } });
await P('bro_tablero', { sala: SALA, yo: PRO, nuevo: { tipo: 'reserva', titulo: L('CPU del PC (compilación)', 'PC CPU (build)'), modo: 'exclusiva', caduca_min: 30 } });
textos.cola = await R('bro_tablero', { sala: SALA, yo: RED, nuevo: { tipo: 'reserva', titulo: L('CPU del PC (compilación)', 'PC CPU (build)'), modo: 'compartida', notas: L('exportar las imágenes de la portada', 'export the home page images') } });
await R('bro_tablero', { sala: SALA, yo: RED, nuevo: { tipo: 'decision', titulo: L('Tuteo en toda la web', 'Informal tone across the site'), estado: 'acordada' } });

textos.numero = await P('bro_numero', { serie: L('incidencias', 'issues'), yo: PRO, sala: SALA, prefijo: 'W', empezar_en: 1, cantidad: 2, motivo: L('enlaces rotos en precios y contacto', 'broken links on pricing and contact') });
await P('bro_tablero', { sala: SALA, yo: PRO, nuevo: { tipo: 'tarea', titulo: L('Arreglar W1 y W2 (enlaces rotos)', 'Fix W1 and W2 (broken links)'), responsable: PRO } });
await P('bro_enviar', { sala: SALA, yo: PRO, clase: 'bitacora', texto: L('Comprobador de enlaces: 2 rotos (W1, W2). Los arreglo yo.', 'Link checker: 2 broken (W1, W2). I will fix them.') });

await V('bro_enviar', {
  sala: SALA, yo: REV, para: RED, clase: 'entrega',
  texto: L(
    'Hecho: 4 erratas y 2 frases acortadas.\n- «a sido» → «ha sido»\n- «email» → «correo electrónico»\n- Frase del titular: de 31 a 17 palabras.',
    'Done: 4 typos and 2 shorter sentences.\n- "it\'s features" → "its features"\n- "e-mail" → "email"\n- Headline sentence: from 31 to 17 words.'),
  tarea: { id: T1, estado: 'hecha' },
});

await R('bro_enviar', {
  sala: SALA, yo: RED, para: MOD, clase: 'pregunta',
  texto: L('¿Mostramos los precios con IVA incluido o sin IVA?', 'Do we show prices with or without VAT?'),
  por_defecto: L('Con IVA incluido, como en la web actual', 'VAT included, as on the current site'),
  plazo_min: 60,
});
await P('bro_enviar', {
  sala: SALA, yo: PRO, para: MOD, clase: 'peticion',
  texto: L('¿Puedo borrar la carpeta `web/antigua`? Ocupa 2 GB y ya no se usa.', 'May I delete the `web/old` folder? It takes 2 GB and is no longer used.'),
});
await peticion(PUERTO, 'POST', `/api/salas/${SALA}/mensaje`, {
  cuerpo: { texto: L('Muy bien. Recordad: no se publica nada hasta que yo dé el OK el viernes.', 'Great. Remember: nothing goes live until I give the OK on Friday.') },
  cabeceras: { 'X-HeyBro': '1', Origin: `http://127.0.0.1:${PUERTO}` },
});
await P('bro_actualizar', { sala: SALA, yo: PRO, ficha: { estado: L('Compilando la web (4 min)', 'Building the site (4 min)') } });

// Sala permanente del PC
await P('bro_crear_sala', {
  nombre: L('canal-pc', 'pc-channel'), permanente: true,
  tema: L('Canal del PC', 'PC channel'),
  objetivo: L('Avisos entre todas las sesiones de este PC', 'Notices between all sessions on this PC'),
  papel_invitado: L('cualquier sesión de este PC', 'any session on this PC'),
  yo: PRO,
  ficha: { tipo_sesion: 'Claude Code', papel: L('Guardián del PC', 'PC keeper'), mision: L('Avisar de compilaciones y procesos largos', 'Announce builds and long jobs'), capacidades: L('Terminal en el PC', 'Terminal on the PC'), limites: L('Nada destructivo sin OK', 'Nothing destructive without OK') },
  dossier: L('# Canal del PC\n\nAquí avisamos de procesos largos y de quién usa la CPU.', '# PC channel\n\nHere we announce long jobs and who is using the CPU.'),
});

// Una pregunta de hace horas cuyo plazo venció (el hermano siguió con su opción por defecto)
const hace = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const dirB = path.join(CARPETA, 'salas', L('boletin-octubre', 'october-newsletter'));
fs.mkdirSync(path.join(dirB, 'registro'), { recursive: true });
fs.mkdirSync(path.join(dirB, 'presencia'), { recursive: true });
fs.writeFileSync(path.join(dirB, 'sala.json'), JSON.stringify({ id: path.basename(dirB), tema: L('Boletín de octubre', 'October newsletter'), objetivo: '', creada: hace(5), creador: RED, limite_inicial: 40, invitacion: 'hey Bro!', version: 2 }));
const regB = (n, t, e) => fs.writeFileSync(path.join(dirB, 'registro', `${String(n).padStart(6, '0')}.json`), JSON.stringify({ n, t, ...e }));
const fichaB = { tipo_sesion: 'Cowork', papel: 'x', mision: 'x', capacidades: 'x', limites: 'x' };
regB(1, hace(5), { tipo: 'sala', accion: 'creada', de: RED });
regB(2, hace(5), { tipo: 'union', de: RED, ficha: { ...fichaB, papel: L('Redacta el boletín', 'Writes the newsletter') }, dossier: L('Dossier del boletín con contexto suficiente.', 'Newsletter dossier with enough context.') });
regB(3, hace(4.9), { tipo: 'union', de: REV, ficha: { ...fichaB, papel: L('Revisa el boletín', 'Reviews the newsletter') }, dossier: L('Dossier del revisor con contexto suficiente.', 'Reviewer dossier with enough context.') });
regB(4, hace(3), { tipo: 'mensaje', de: REV, clase: 'pregunta', para: [MOD], texto: L('¿Usamos «email» o «correo electrónico» en el boletín?', 'Do we write "e-mail" or "email" in the newsletter?'), por_defecto: L('«correo electrónico», como pide la guía de estilo', '"email", as the style guide says'), plazo_min: 60 });
// El hermano aplicó su opción por defecto al vencer el plazo y lo anotó.
await V('bro_enviar', { sala: path.basename(dirB), yo: REV, clase: 'bitacora', texto: L('Sin respuesta: uso «correo electrónico».', 'No answer: I use "email".'), resuelve: [4] });

// Una pregunta antigua que nadie contestó (sala archivada que espera a un hermano)
salaAntigua(CARPETA, {
  id: L('pregunta-captcha', 'captcha-question'), tema: L('¿Captcha en el formulario?', 'Captcha on the form?'), quien: L('Investigador', 'Researcher'), dias: 9,
  texto: L('¿Alguien sabe si el formulario de contacto necesita captcha?', 'Does anyone know whether the contact form needs a captcha?'),
});

// Textos de las herramientas (para revisar su redacción)
textos.contexto = await V('bro_contexto', { sala: SALA, yo: REV, de: RED });
textos.salas = await V('bro_salas', {});
textos.esperarProgramador = await P('bro_esperar', { sala: SALA, yo: PRO, segundos: 0 });
textos.esperarRedactor = await R('bro_esperar', { sala: SALA, yo: RED, segundos: 0 });
textos.esperarRevisor = await V('bro_esperar', { sala: SALA, yo: REV, segundos: 0 });
fs.writeFileSync(path.join(SALIDA, `textos-${IDIOMA}.json`), JSON.stringify(textos, null, 2));

// Dos hermanos quedan escuchando mientras se hacen las capturas
const escuchas = [V('bro_esperar', { sala: SALA, yo: REV, segundos: 45 }).catch(() => {}), P('bro_esperar', { sala: SALA, yo: PRO, segundos: 45 }).catch(() => {})];
await dormir(600);

const nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let errores = 0;
async function captura(nombre, { ancho, alto, esquema, accion }) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, colorScheme: esquema, deviceScaleFactor: 2 });
  const pag = await ctx.newPage();
  const fallos = [];
  pag.on('pageerror', (e) => fallos.push(e.message));
  pag.on('console', (m) => { if (m.type() === 'error') fallos.push(m.text()); });
  await pag.goto(`http://127.0.0.1:${PUERTO}/#${SALA}`);
  await pag.waitForSelector('.msg');
  await pag.waitForTimeout(1500);
  if (accion) await accion(pag);
  await pag.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });
  const anchoDoc = await pag.evaluate(() => document.documentElement.scrollWidth);
  if (anchoDoc > ancho) fallos.push(`desborde horizontal: ${anchoDoc}px > ${ancho}px`);
  await ctx.close();
  errores += fallos.length;
  console.log(`captura ${nombre}.png${fallos.length ? `  ⚠ ${fallos.join(' | ')}` : ''}`);
}
const I = IDIOMA;
await captura(`${I}-claro`, { ancho: 1440, alto: 900, esquema: 'light' });
await captura(`${I}-oscuro`, { ancho: 1440, alto: 900, esquema: 'dark' });
await captura(`${I}-tablero`, { ancho: 1440, alto: 900, esquema: 'light', accion: (p) => p.click('#tabTablero') });
await captura(`${I}-tablero-oscuro`, { ancho: 1440, alto: 900, esquema: 'dark', accion: (p) => p.click('#tabTablero') });
await captura(`${I}-bandeja`, { ancho: 1440, alto: 900, esquema: 'light', accion: async (p) => { await p.click('#btnBandeja'); await p.waitForTimeout(400); } });
await captura(`${I}-bandeja-oscuro`, { ancho: 1440, alto: 900, esquema: 'dark', accion: async (p) => { await p.click('#btnBandeja'); await p.waitForTimeout(400); } });
await captura(`${I}-dossier`, { ancho: 1440, alto: 900, esquema: 'light', accion: async (p) => { await p.click('.herm .btn'); await p.waitForTimeout(400); } });
await captura(`${I}-salas-archivadas`, { ancho: 1440, alto: 900, esquema: 'light', accion: async (p) => { await p.check('#verCerradas'); await p.waitForTimeout(300); } });
await captura(`${I}-medio-panel`, { ancho: 1000, alto: 800, esquema: 'light', accion: async (p) => { await p.click('#btnPanel'); await p.waitForTimeout(400); } });
await captura(`${I}-movil`, { ancho: 390, alto: 844, esquema: 'light' });
await captura(`${I}-movil-bandeja`, { ancho: 390, alto: 844, esquema: 'dark', accion: async (p) => { await p.click('#btnBandeja'); await p.waitForTimeout(400); } });

// Prueba funcional de la bandeja: responder una pregunta y dar otra por hecha.
{
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
  const pag = await ctx.newPage();
  const fallos = [];
  pag.on('pageerror', (e) => fallos.push(e.message));
  await pag.goto(`http://127.0.0.1:${PUERTO}/#${SALA}`);
  await pag.waitForSelector('.msg');
  await pag.waitForFunction(() => document.querySelector('#cuentaBandeja').textContent === '2');
  await pag.click('#btnBandeja');
  await pag.fill('.asunto textarea', L('Con IVA incluido.', 'VAT included.'));
  await pag.click('.asunto .btn.primario');
  await pag.waitForFunction(() => document.querySelector('#cuentaBandeja').textContent === '1', null, { timeout: 8000 });
  await pag.click('.asunto .respuesta .btn:not(.primario)');
  await pag.waitForFunction(() => document.querySelector('#cuentaBandeja').textContent === '0', null, { timeout: 8000 });
  await pag.click('#modalCerrar');
  await pag.waitForTimeout(1800);
  const ultimo = await pag.evaluate(() => [...document.querySelectorAll('.msg.moderador')].pop()?.textContent || '');
  const ok = /→ (Redactor|Writer)/.test(ultimo) && /(Con IVA incluido|VAT included)\./.test(ultimo) && !fallos.length;
  if (!ok) errores++;
  console.log(`${ok ? '✓' : '✗'} bandeja: responder y «hecho» funcionan${ok ? '' : ` — ${ultimo} ${fallos.join(' | ')}`}`);
  textos.trasBandeja = await R('bro_esperar', { sala: SALA, yo: RED, segundos: 0 });
  fs.writeFileSync(path.join(SALIDA, `textos-${IDIOMA}.json`), JSON.stringify(textos, null, 2));
  await ctx.close();
}
await nav.close();

await Promise.all([R.cerrar(), V.cerrar(), P.cerrar()]);
await Promise.allSettled(escuchas);
console.log(errores ? `\n${errores} problemas en el visor` : '\nvisor sin errores');
process.exit(errores ? 1 : 0);
