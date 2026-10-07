// Prueba de extremo a extremo en español: tres "sesiones" (A, B, C) = tres procesos del
// servidor hablando por el protocolo MCP real sobre la misma carpeta compartida.
import fs from 'node:fs';
import path from 'node:path';
import { carpetaTemporal, crearPrueba, dormir, inyectar, peticion, salaAntigua, sesion } from './comun.mjs';

const SERVIDOR = process.argv[2] || 'paquete/server/index.cjs';
const CARPETA = carpetaTemporal('heybro-es-');
const PUERTO = 4620;
const MOD = 'Ana';
const { ok, fin } = crearPrueba();
const pet = (...a) => peticion(PUERTO, ...a);
const POST = { 'X-HeyBro': '1' };

const FICHA = (papel) => ({
  tipo_sesion: 'Cowork', papel, mision: `Misión de ${papel}`,
  capacidades: 'Bash en la nube y conectores', limites: 'No veo archivos del PC salvo carpetas conectadas',
  disponibilidad: 'escucha activa',
});
const DOSSIER = (quien) => `# Dossier de ${quien}\n\n1. Encargo de Ana (literal): «prepara la parte ${quien}».\n2. Hecho hasta ahora: nada.\n3. Datos clave: presupuesto 50.000 €.\n4. Plan: empezar mañana.`;

async function main() {
  console.log(`Servidor: ${SERVIDOR}\nCarpeta: ${CARPETA}\n`);
  const conf = { servidor: SERVIDOR, carpeta: CARPETA, puerto: PUERTO, idioma: 'es', moderador: MOD };
  const A = await sesion(conf);
  const B = await sesion(conf);
  const C = await sesion(conf);
  let r;

  console.log('1. Herramientas e instrucciones');
  const { tools } = await A.client.listTools();
  const nombres = tools.map((t) => t.name);
  ok(tools.length === 12 && nombres.includes('bro_numero') && nombres.every((n) => n.startsWith('bro_')), `12 herramientas en español (${nombres.join(', ')})`);
  ok(/AUTONOMÍA/.test(A.client.getInstructions?.() || ''), 'instrucciones con el principio de autonomía');

  console.log('2. Crear, unirse y lectura de vuelta');
  r = await A.llamar('bro_crear_sala', { tema: 'Lanzamiento de la web', objetivo: 'Publicar la web el viernes', papel_invitado: 'revisor', yo: 'Redactor', ficha: FICHA('redactor'), dossier: DOSSIER('Redactor') });
  ok(!r.error && /Sala creada: «lanzamiento-de-la-web»/.test(r.texto) && /hey Bro! Únete a la sala/.test(r.texto), 'sala creada con invitación', r.texto);
  const SALA = 'lanzamiento-de-la-web';
  r = await B.llamar('bro_unirse', { sala: SALA, yo: 'Revisor', ficha: FICHA('revisor'), dossier: DOSSIER('Revisor') });
  ok(!r.error && /Dossier de Redactor/.test(r.texto) && /50\.000/.test(r.texto) && /LECTURA DE VUELTA/.test(r.texto), 'B ve el dossier de A y la indicación de lectura de vuelta', r.texto);
  r = await B.llamar('bro_unirse', { sala: SALA, yo: 'Ana', ficha: FICHA('x'), dossier: DOSSIER('x') });
  ok(r.error && /reservado/.test(r.texto), 'el nombre del moderador está reservado');
  const t0 = Date.now();
  const esperaA = A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 20 });
  await dormir(1200);
  await B.llamar('bro_enviar', { sala: SALA, yo: 'Revisor', para: 'Redactor', clase: 'respuesta', texto: 'Te entiendo así: redactas tú y reviso yo. ¿Correcto?' });
  r = await esperaA;
  ok(Date.now() - t0 < 6000 && /Te entiendo así/.test(r.texto) && /Dossier de Revisor/.test(r.texto), 'A despierta al momento y recibe la ficha y el dossier de B', r.texto);

  console.log('3. Encargos');
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', para: 'Revisor', clase: 'encargo', titulo: 'Revisar textos', origen: 'que el revisor mire los textos', texto: 'Revisa los textos de la portada.' });
  const T = /Creada la tarea (T\d+)/.exec(r.texto)?.[1];
  ok(!r.error && T, 'encargo con tarea automática', r.texto);
  r = await B.llamar('bro_esperar', { sala: SALA, yo: 'Revisor', segundos: 5 });
  ok(/ENCARGO para ti/.test(r.texto) && /Petición original del usuario/.test(r.texto), 'B recibe el encargo con la petición literal', r.texto);
  await B.llamar('bro_tablero', { sala: SALA, yo: 'Revisor', cambiar: { id: T, estado: 'en_curso' } });
  await B.llamar('bro_enviar', { sala: SALA, yo: 'Revisor', clase: 'bitacora', texto: 'Portada revisada al 50 %.' });
  await B.llamar('bro_actualizar', { sala: SALA, yo: 'Revisor', ficha: { estado: 'Revisando' }, anadir_al_dossier: '5. Hallazgo: falta el aviso legal.' });
  r = await A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 3 });
  ok(/en curso/.test(r.texto) && /bitácora de Revisor/.test(r.texto) && /Añadido al dossier/.test(r.texto), 'A ve el progreso de B (tarea, bitácora, dossier)', r.texto);
  r = await B.llamar('bro_enviar', { sala: SALA, yo: 'Revisor', para: 'Redactor', clase: 'entrega', texto: 'Hecho: 3 erratas corregidas.', tarea: { id: T, estado: 'hecha' } });
  ok(!r.error && new RegExp(`${T} → hecha`).test(r.texto), 'entrega y cierre de la tarea en una llamada', r.texto);

  console.log('4. Reservas exclusivas, compartidas y cola');
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'reserva', titulo: 'C:\\Web\\portada.html' } });
  const RA = /(R\d+) activa/.exec(r.texto)?.[1];
  ok(!r.error && RA, 'A reserva un archivo (exclusiva)', r.texto);
  r = await B.llamar('bro_tablero', { sala: SALA, yo: 'Revisor', nuevo: { tipo: 'reserva', titulo: 'c:/web/PORTADA.html' } });
  const RB = /(R\d+) en cola: 1\.º/.exec(r.texto)?.[1];
  ok(!r.error && RB && new RegExp(`detrás de ${RA}`).test(r.texto), 'B entra en cola detrás de A (ruta normalizada)', r.texto);
  r = await C.llamar('bro_unirse', { sala: SALA, yo: 'Disenador', ficha: FICHA('diseñador'), dossier: DOSSIER('Disenador') });
  r = await C.llamar('bro_tablero', { sala: SALA, yo: 'Disenador', nuevo: { tipo: 'reserva', titulo: 'C:\\Web\\portada.html', esperar_turno: false } });
  ok(/RESERVA RECHAZADA/.test(r.texto), 'con esperar_turno=false se rechaza', r.texto);
  r = await B.llamar('bro_tablero', { sala: SALA, yo: 'Revisor', cambiar: { id: RA, estado: 'liberada' } });
  ok(r.error && /solo esa sesión/.test(r.texto), 'nadie libera la reserva de otro');
  const t1 = Date.now();
  const esperaB = B.llamar('bro_esperar', { sala: SALA, yo: 'Revisor', segundos: 20 });
  await dormir(1000);
  await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', cambiar: { id: RA, estado: 'liberada' } });
  r = await esperaB;
  ok(Date.now() - t1 < 6000 && new RegExp(`TE TOCA: tu reserva ${RB}`).test(r.texto), 'al liberar, B despierta con «te toca»', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'reserva', titulo: 'CPU del PC', modo: 'compartida' } });
  r = await C.llamar('bro_tablero', { sala: SALA, yo: 'Disenador', nuevo: { tipo: 'reserva', titulo: 'cpu del pc', modo: 'compartida' } });
  ok(/activa/.test(r.texto) && !/en cola/.test(r.texto.split('\n')[0]), 'dos reservas compartidas conviven', r.texto);
  r = await B.llamar('bro_tablero', { sala: SALA, yo: 'Revisor', nuevo: { tipo: 'reserva', titulo: 'CPU del PC', modo: 'exclusiva' } });
  ok(/en cola: 1\.º/.test(r.texto), 'una exclusiva espera a que acaben las compartidas', r.texto);
  const hace5h = new Date(Date.now() - 5 * 3600_000).toISOString();
  const nViejo = inyectar(CARPETA, SALA, { t: hace5h, tipo: 'tablero', accion: 'nuevo', de: 'Revisor', item: { tipo: 'reserva', titulo: 'C:/Web/logo.svg', duracion_min: 240 } });
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor' });
  ok(!new RegExp(`R${nViejo} `).test(r.texto) && /cerrados ocultos/.test(r.texto), 'una reserva caducada no se muestra por defecto', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', todo: true });
  ok(new RegExp(`R${nViejo} \\[caducada\\]`).test(r.texto), 'con todo=true se ve caducada', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'reserva', titulo: 'C:/Web/logo.svg', caduca_min: 30 } });
  ok(/activa/.test(r.texto.split('\n')[0]), 'una reserva caducada no bloquea a nadie', r.texto);
  const RL = /(R\d+) activa/.exec(r.texto)?.[1];
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'reserva', titulo: 'C:/Web/logo.svg' } });
  ok(/activa/.test(r.texto.split('\n')[0]), 'el mismo hermano no choca consigo mismo', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', cambiar: { id: RL, estado: 'activa' } });
  ok(!r.error && /actualizado/.test(r.texto), 'renovar una reserva activa', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'decision', titulo: 'Tuteo en toda la web', estado: 'acordada' } });
  ok(/D\d+ \[acordada\]/.test(r.texto), 'una decisión puede nacer ya acordada', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'tarea', titulo: 'x', estado: 'volando' } });
  ok(r.error, 'un estado inicial inválido se rechaza', r.texto);
  r = await A.llamar('bro_tablero', { sala: SALA, yo: 'Redactor', nuevo: { tipo: 'Decisión', titulo: 'Fuente del sistema', estado: 'Propuesta' } });
  ok(!r.error && /D\d+ \[propuesta\] Fuente del sistema/.test(r.texto), 'acepta valores con tildes y mayúsculas', r.texto);

  console.log('5. Contadores compartidos');
  r = await A.llamar('bro_numero', { serie: 'planos', yo: 'Redactor', prefijo: 'B', empezar_en: 147, motivo: 'revisión', sala: SALA });
  ok(/Tuyo: B147/.test(r.texto) && /Siguiente libre: B148/.test(r.texto), 'primer número con prefijo y empezar_en', r.texto);
  const lotes = await Promise.all([A, B, C].map((S, i) => Promise.all(Array.from({ length: 10 }, () => S.llamar('bro_numero', { serie: 'planos', yo: ['Redactor', 'Revisor', 'Disenador'][i] })))));
  const numeros = lotes.flat().map((x) => Number(/Tuyo: B(\d+)/.exec(x.texto)?.[1])).sort((a, b) => a - b);
  ok(numeros.length === 30 && new Set(numeros).size === 30 && numeros[0] === 148 && numeros[29] === 177, `30 números simultáneos sin choques (B${numeros[0]}–B${numeros[29]})`);
  r = await C.llamar('bro_numero', { serie: 'Planos', yo: 'Disenador', solo_ver: true });
  ok(/siguiente libre: B178/.test(r.texto), 'solo_ver muestra el siguiente libre', r.texto);
  r = await B.llamar('bro_esperar', { sala: SALA, yo: 'Revisor', segundos: 0 });
  ok(/Redactor toma B147 de la serie «planos»: revisión/.test(r.texto), 'el número anunciado llega a la sala', r.texto.slice(-600));

  console.log('6. Bandeja del moderador y autonomía');
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', para: MOD, clase: 'pregunta', texto: '¿Portada azul o verde?', por_defecto: 'azul', plazo_min: 60 });
  const nQ = Number(/Enviado #(\d+)/.exec(r.texto)?.[1]);
  ok(!r.error && !/Consejo/.test(r.texto), 'pregunta al moderador con opción por defecto y plazo', r.texto);
  let h = await pet('GET', '/api/bandeja');
  ok(h.json?.pendientes?.some((x) => x.n === nQ && x.por_defecto === 'azul'), 'aparece en la bandeja del moderador', JSON.stringify(h.json));
  await dormir(8000);
  const avisados = JSON.parse(fs.readFileSync(path.join(CARPETA, 'avisos.json'), 'utf8')).avisados;
  ok(avisados.includes(`${SALA}#${nQ}`), 'el aviso del sistema se registra (sin repetirse)');
  h = await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'Verde, gracias.', para: 'Redactor' }, cabeceras: POST });
  h = await pet('GET', '/api/bandeja');
  ok(!h.json.pendientes.some((x) => x.n === nQ), 'la respuesta del moderador la resuelve');
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', para: MOD, clase: 'pregunta', texto: '¿Tipografía con serifa?', por_defecto: 'sí', plazo_min: 60 });
  const nQ2 = Number(/Enviado #(\d+)/.exec(r.texto)?.[1]);
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', para: MOD, clase: 'pregunta', texto: '¿Logo en blanco?', por_defecto: 'no', plazo_min: 60 });
  const nQ3 = Number(/Enviado #(\d+)/.exec(r.texto)?.[1]);
  await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'Buen trabajo, equipo.' }, cabeceras: POST });
  h = await pet('GET', '/api/bandeja');
  ok(h.json.pendientes.some((x) => x.n === nQ2) && h.json.pendientes.some((x) => x.n === nQ3), 'un mensaje general del moderador no resuelve preguntas');
  h = await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'Con serifa, sí.', para: 'Redactor', resuelve: [nQ2] }, cabeceras: POST });
  const h2 = await pet('GET', '/api/bandeja');
  ok(h.estado === 200 && !h2.json.pendientes.some((x) => x.n === nQ2) && h2.json.pendientes.some((x) => x.n === nQ3), 'responder desde la bandeja resuelve solo esa pregunta', JSON.stringify(h.json));
  h = await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'x', resuelve: [99999] }, cabeceras: POST });
  ok(h.estado === 400, 'no se puede resolver una pregunta inexistente');
  await pet('POST', `/api/salas/${SALA}/accion`, { cuerpo: { accion: 'resolver', ref: nQ3 }, cabeceras: POST });
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', para: MOD, clase: 'peticion', texto: '¿Puedo usar la foto del equipo?' });
  ok(/Consejo/.test(r.texto), 'sin opción por defecto, se aconseja ponerla', r.texto);
  const nP = Number(/Enviado #(\d+)/.exec(r.texto)?.[1]);
  h = await pet('POST', `/api/salas/${SALA}/accion`, { cuerpo: { accion: 'resolver', ref: nP }, cabeceras: POST });
  h = await pet('GET', '/api/bandeja');
  ok(!h.json.pendientes.some((x) => x.n === nP), 'el moderador puede darla por resuelta desde el visor');
  const nV = inyectar(CARPETA, SALA, { t: new Date(Date.now() - 2 * 3600_000).toISOString(), tipo: 'mensaje', de: 'Redactor', clase: 'pregunta', texto: '¿Publico el lunes?', para: [MOD], por_defecto: 'sí, el lunes', plazo_min: 30 });
  r = await A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 0 });
  ok(new RegExp(`Plazo vencido sin respuesta de ${MOD} a tu #${nV}`).test(r.texto) && /sí, el lunes/.test(r.texto), 'plazo vencido: sigue con su opción por defecto', r.texto);
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', clase: 'bitacora', texto: 'Sin respuesta: publico el lunes.', resuelve: [nV] });
  ok(!r.error && /Marcadas como resueltas: #/.test(r.texto), 'la marca como resuelta al aplicar su opción', r.texto);
  r = await A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 0 });
  ok(!/Plazo vencido/.test(r.texto), 'el recordatorio desaparece', r.texto);
  h = await pet('GET', '/api/bandeja');
  ok(h.json.vencidas.some((x) => x.n === nV && x.estado === 'decidida') && !h.json.pendientes.some((x) => x.n === nV), 'sigue en «Decidido sin ti» tras aplicarla', JSON.stringify(h.json.vencidas));
  for (const nombre of ['Moderador', 'usuario', 'Todos']) {
    r = await C.llamar('bro_unirse', { sala: SALA, yo: nombre, ficha: FICHA('x'), dossier: DOSSIER('x') });
    ok(r.error && /reservado|todos/.test(r.texto), `nadie puede llamarse «${nombre}»`, r.texto);
  }
  r = await B.llamar('bro_enviar', { sala: SALA, yo: 'Revisor', resuelve: [nV], clase: 'bitacora', texto: 'x' });
  ok(r.error && /no es una pregunta tuya/.test(r.texto), 'nadie resuelve las preguntas de otro');

  console.log('7. Salas permanentes, archivo y ayuda');
  r = await A.llamar('bro_crear_sala', { tema: 'Uso del PC', permanente: true, limite_mensajes: 4, yo: 'Redactor', ficha: FICHA('redactor'), dossier: DOSSIER('Redactor') });
  ok(/Permanente \(sin límite\)/.test(r.texto), 'sala permanente creada', r.texto);
  for (let i = 0; i < 6; i++) r = await A.llamar('bro_enviar', { sala: 'uso-del-pc', yo: 'Redactor', texto: `turno ${i}` });
  ok(!r.error, 'una sala permanente no tiene límite de mensajes', r.texto);
  r = await A.llamar('bro_actualizar', { sala: SALA, yo: 'Redactor', sala_permanente: true });
  ok(/PERMANENTE/.test(r.texto), 'una sala existente puede pasar a permanente', r.texto);
  salaAntigua(CARPETA, { id: 'pregunta-vieja', tema: 'Pregunta sin respuesta', quien: 'Investigador', texto: '¿Alguien sabe si hace falta el plugin X?', dias: 9 });
  r = await C.llamar('bro_salas', {});
  ok(!/«pregunta-vieja» ·/.test(r.texto) && /Esperan ayuda/.test(r.texto) && /pregunta-vieja/.test(r.texto) && /permanente/.test(r.texto), 'archivada fuera de la lista, pero ofrecida como «espera ayuda»', r.texto);
  r = await C.llamar('bro_salas', { incluir_cerradas: true });
  ok(/«pregunta-vieja» · archivada/.test(r.texto), 'con incluir_cerradas se ve archivada', r.texto);
  r = await B.llamar('bro_unirse', { sala: 'uso-del-pc', yo: 'Revisor', ficha: FICHA('revisor'), dossier: DOSSIER('Revisor') });
  ok(/Esperan ayuda/.test(r.texto) && /pregunta-vieja/.test(r.texto), 'al unirse a otra sala se ofrece ayudar', r.texto.slice(-500));

  console.log('8. Visor y seguridad');
  h = await pet('GET', '/');
  ok(h.estado === 200 && /<html lang="es">/.test(h.texto), 'visor en español');
  h = await pet('GET', '/api/ping');
  ok(h.json?.idioma === 'es' && h.json?.moderador === MOD, 'ping con idioma y moderador');
  h = await pet('GET', '/api/salas', { cabeceras: { Host: 'evil.com' } });
  ok(h.estado === 403, 'Host ajeno → 403');
  h = await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'x' } });
  ok(h.estado === 403, 'POST sin cabecera → 403');
  h = await pet('POST', `/api/salas/${SALA}/mensaje`, { cuerpo: { texto: 'x' }, cabeceras: { ...POST, Origin: 'https://evil.com' } });
  ok(h.estado === 403, 'POST desde otro origen → 403');
  h = await pet('GET', `/api/salas/${SALA}`);
  ok(h.json?.permanente === true && h.json.tablero.some((i) => i.estado === 'en_cola') && !h.json.tablero.some((i) => i.periodos), 'la vista de sala trae reservas evaluadas', JSON.stringify(h.json?.tablero?.slice(0, 2)));
  h = await pet('GET', `/api/salas/${SALA}/transcripcion.md`);
  ok(/^# hey Bro! — Lanzamiento de la web/.test(h.texto) && /Tablero final/.test(h.texto), 'transcripción en español');

  console.log('9. Pausa, límite, cierre y cancelación');
  await pet('POST', '/api/salas/uso-del-pc/accion', { cuerpo: { accion: 'pausar' }, cabeceras: POST });
  r = await B.llamar('bro_enviar', { sala: 'uso-del-pc', yo: 'Revisor', texto: 'hola' });
  ok(r.error && /EN PAUSA/.test(r.texto), 'en pausa no se envía');
  await pet('POST', '/api/salas/uso-del-pc/accion', { cuerpo: { accion: 'reanudar' }, cabeceras: POST });
  await A.llamar('bro_crear_sala', { tema: 'Sala corta', limite_mensajes: 4, yo: 'Uno', ficha: FICHA('uno'), dossier: DOSSIER('Uno') });
  for (let i = 0; i < 4; i++) await A.llamar('bro_enviar', { sala: 'sala-corta', yo: 'Uno', texto: `m${i}` });
  r = await A.llamar('bro_enviar', { sala: 'sala-corta', yo: 'Uno', texto: 'm4' });
  ok(r.error && /Límite de 4 mensajes/.test(r.texto), 'el límite se respeta en salas temporales');
  r = await A.llamar('bro_enviar', { sala: 'sala-corta', yo: 'Uno', texto: 'm3' });
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', texto: 'repetido' });
  r = await A.llamar('bro_enviar', { sala: SALA, yo: 'Redactor', texto: 'repetido' });
  ok(r.error && /Mensaje repetido/.test(r.texto), 'freno anti-bucles');
  await B.llamar('bro_unirse', { sala: 'sala-corta', yo: 'Dos', ficha: FICHA('dos'), dossier: DOSSIER('Dos') });
  await B.llamar('bro_esperar', { sala: 'sala-corta', yo: 'Dos', segundos: 0 });
  const t2 = Date.now();
  const esperaDos = B.llamar('bro_esperar', { sala: 'sala-corta', yo: 'Dos', segundos: 20 });
  await dormir(700);
  await A.llamar('bro_cerrar', { sala: 'sala-corta', yo: 'Uno', resumen: '- Decidido X.\n- Discrepancia: Y.' });
  r = await esperaDos;
  ok(Date.now() - t2 < 5000 && /SALA CERRADA por Uno/.test(r.texto) && /Discrepancia/.test(r.texto), 'el cierre llega al momento con su resumen', r.texto.slice(-400));
  await A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 0 });
  const ctrl = new AbortController();
  const cancelada = A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 30 }, { signal: ctrl.signal }).catch(() => ({ cancelada: true }));
  await dormir(600);
  await B.llamar('bro_enviar', { sala: SALA, yo: 'Revisor', clase: 'bitacora', texto: 'nota durante la espera cancelada' });
  await dormir(500);
  ctrl.abort();
  r = await cancelada;
  ok(r.cancelada, 'el cliente puede cancelar la espera');
  await dormir(1200);
  r = await A.llamar('bro_esperar', { sala: SALA, yo: 'Redactor', segundos: 0 });
  ok(/nota durante la espera cancelada/.test(r.texto), 'lo llegado durante la espera cancelada sigue sin leer');

  console.log('10. Contexto e historial');
  r = await C.llamar('bro_contexto', { sala: SALA, de: 'Revisor' });
  ok(/Dossier de Revisor \(v2/.test(r.texto) && /Bitácora reciente/.test(r.texto), 'mirar por encima del hombro', r.texto.slice(0, 600));
  r = await C.llamar('bro_historial', { sala: SALA, ultimos: 5 });
  ok(!r.error && /omitidas/.test(r.texto), 'historial con recorte');

  await Promise.all([A.cerrar(), B.cerrar(), C.cerrar()]);
  fin();
}

main().catch((e) => { console.error(e); process.exit(2); });
