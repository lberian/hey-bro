// End-to-end test in English: tool names, parameters, values and outputs in English.
import { carpetaTemporal, crearPrueba, dormir, peticion, sesion } from './comun.mjs';

const SERVIDOR = process.argv[2] || 'paquete/server/index.cjs';
const CARPETA = carpetaTemporal('heybro-en-');
const PUERTO = 4640;
const MOD = 'Alex';
const { ok, fin } = crearPrueba();
const pet = (...a) => peticion(PUERTO, ...a);

const PROFILE = (role) => ({
  session_type: 'Cowork', role, mission: `${role} mission`, capabilities: 'Cloud shell and connectors',
  limits: 'Cannot see files on the PC except connected folders', availability: 'active listening',
});
const DOSSIER = (who) => `# ${who} dossier\n\n1. Request from Alex (verbatim): "prepare the ${who} part".\n2. Done so far: nothing.\n3. Key data: budget 50,000 EUR.\n4. Plan: start tomorrow.`;

async function main() {
  console.log(`Server: ${SERVIDOR}\nFolder: ${CARPETA}\n`);
  const conf = { servidor: SERVIDOR, carpeta: CARPETA, puerto: PUERTO, idioma: 'en', moderador: MOD };
  const A = await sesion(conf);
  const B = await sesion(conf);
  let r;

  console.log('1. Tools');
  const { tools } = await A.client.listTools();
  const names = tools.map((t) => t.name).sort().join(',');
  ok(names === 'bro_board,bro_close,bro_context,bro_create_room,bro_history,bro_join,bro_number,bro_rooms,bro_send,bro_update,bro_viewer,bro_wait', `English tool names (${names})`);
  const send = tools.find((t) => t.name === 'bro_send');
  ok(send.inputSchema.properties.kind.enum.includes('assignment') && send.inputSchema.properties.to && !send.inputSchema.properties.para, 'English parameters and values in the schema');
  ok(/AUTONOMY/.test(A.client.getInstructions?.() || ''), 'English server instructions');

  console.log('2. Rooms and read-back');
  r = await A.llamar('bro_create_room', { topic: 'Website launch', goal: 'Ship on Friday', guest_role: 'reviewer', me: 'Writer', profile: PROFILE('writer'), dossier: DOSSIER('Writer') });
  ok(!r.error && /Room created: "website-launch"/.test(r.texto) && /hey Bro! Join room "website-launch"/.test(r.texto) && /bro_join with room="website-launch"/.test(r.texto), 'room created with an English invitation', r.texto);
  const ROOM = 'website-launch';
  r = await B.llamar('bro_join', { room: ROOM, me: 'Reviewer', profile: PROFILE('reviewer'), dossier: DOSSIER('Reviewer') });
  ok(!r.error && /Writer's dossier/.test(r.texto) && /READ-BACK/.test(r.texto), 'join shows the sibling dossier in English', r.texto);
  r = await B.llamar('bro_join', { room: ROOM, me: 'Other', profile: { role: 'x' }, dossier: DOSSIER('x') });
  ok(r.error && /Missing profile fields: session_type, mission, capabilities, limits/.test(r.texto), 'validation messages use English field names', r.texto);
  const t0 = Date.now();
  const waitA = A.llamar('bro_wait', { room: ROOM, me: 'Writer', seconds: 20 });
  await dormir(1000);
  await B.llamar('bro_send', { room: ROOM, me: 'Reviewer', to: 'Writer', kind: 'answer', text: 'My read-back: you write, I review. Correct?' });
  r = await waitA;
  ok(Date.now() - t0 < 6000 && /My read-back/.test(r.texto) && /Reviewer's dossier/.test(r.texto), 'wake-up and news in English', r.texto);

  console.log('3. Assignments');
  r = await A.llamar('bro_send', { room: ROOM, me: 'Writer', to: 'Reviewer', kind: 'assignment', title: 'Review copy', origin: 'ask the reviewer to check the copy', text: 'Review the homepage copy.' });
  const T = /Task (T\d+) created for Reviewer/.exec(r.texto)?.[1];
  ok(!r.error && T, 'assignment creates a task', r.texto);
  r = await B.llamar('bro_wait', { room: ROOM, me: 'Reviewer', seconds: 5 });
  ok(/ASSIGNMENT for you/.test(r.texto) && /User's original request \(verbatim\)/.test(r.texto), 'assignment received in English', r.texto);
  r = await B.llamar('bro_board', { room: ROOM, me: 'Reviewer', change: { id: T, status: 'in_progress' } });
  ok(new RegExp(`${T} \\[in_progress\\]`).test(r.texto), 'English status values are accepted and shown', r.texto);
  r = await B.llamar('bro_send', { room: ROOM, me: 'Reviewer', to: 'Writer', kind: 'delivery', text: 'Done: 3 typos fixed.', task: { id: T, status: 'done' } });
  ok(!r.error && new RegExp(`${T} → done`).test(r.texto), 'delivery closes the task', r.texto);

  console.log('4. Reservations and counters');
  r = await A.llamar('bro_board', { room: ROOM, me: 'Writer', new: { type: 'reservation', title: 'PC CPU', mode: 'exclusive' } });
  const RA = /(R\d+) active/.exec(r.texto)?.[1];
  r = await B.llamar('bro_board', { room: ROOM, me: 'Reviewer', new: { type: 'reservation', title: 'pc cpu', mode: 'shared' } });
  ok(/queued: #1/.test(r.texto) && new RegExp(`behind ${RA}`).test(r.texto), 'queue in English', r.texto);
  const t1 = Date.now();
  const waitB = B.llamar('bro_wait', { room: ROOM, me: 'Reviewer', seconds: 20 });
  await dormir(800);
  await A.llamar('bro_board', { room: ROOM, me: 'Writer', change: { id: RA, status: 'released' } });
  r = await waitB;
  ok(Date.now() - t1 < 6000 && /YOUR TURN/.test(r.texto), 'woken when it is your turn', r.texto);
  r = await A.llamar('bro_number', { series: 'drawings', me: 'Writer', prefix: 'B', start_at: 10, reason: 'test', room: ROOM });
  ok(/Yours: B10/.test(r.texto) && /Next free: B11/.test(r.texto), 'shared counter in English', r.texto);

  console.log('5. Moderator inbox and autonomy');
  r = await A.llamar('bro_send', { room: ROOM, me: 'Writer', to: MOD, kind: 'question', text: 'Blue or green?', default: 'blue', deadline_min: 60 });
  const nQ = Number(/Sent #(\d+)/.exec(r.texto)?.[1]);
  const h = await pet('GET', '/api/bandeja');
  ok(h.json?.pendientes?.some((x) => x.n === nQ && x.por_defecto === 'blue'), 'question shows up in the inbox', JSON.stringify(h.json));
  r = await A.llamar('bro_send', { room: ROOM, me: 'Writer', to: MOD, kind: 'request', text: 'Can I use the team photo?' });
  ok(/Tip: in questions to the moderator add default and deadline_min/.test(r.texto), 'English tip for defaults', r.texto);
  r = await A.llamar('bro_send', { room: ROOM, me: 'Writer', to: 'moderator', kind: 'question', text: 'Serif or sans?', default: 'sans', deadline_min: 30 });
  const nAlias = Number(/Sent #(\d+)/.exec(r.texto)?.[1]);
  const h3 = await pet('GET', '/api/bandeja');
  ok(h3.json?.pendientes?.some((x) => x.n === nAlias && x.de === 'Writer'), '"moderator" works as an alias of the moderator name', r.texto);

  console.log('6. Mixed-language arguments and viewer');
  r = await A.llamar('bro_send', { sala: ROOM, yo: 'Writer', texto: 'Spanish parameter names still work.', clase: 'mensaje' });
  ok(!r.error && /Sent #/.test(r.texto), 'canonical (Spanish) parameters are accepted too', r.texto);
  r = await A.llamar('bro_update', { room: ROOM, me: 'Writer', room_permanent: true });
  ok(/now PERMANENT/.test(r.texto), 'room made permanent', r.texto);
  r = await A.llamar('bro_rooms', {});
  ok(/"website-launch" · open · permanent/.test(r.texto), 'room list in English', r.texto);
  const html = await pet('GET', '/');
  ok(/<html lang="en">/.test(html.texto), 'viewer served in English');
  const ping = await pet('GET', '/api/ping');
  ok(ping.json?.idioma === 'en', 'ping reports English');
  const md = await pet('GET', `/api/salas/${ROOM}/transcripcion.md`);
  ok(/^# hey Bro! — Website launch/.test(md.texto) && /Final board/.test(md.texto) && /- Room: `website-launch`/.test(md.texto) && /room: created/.test(md.texto) && /room: permanent/.test(md.texto) && !/creada|peticion/.test(md.texto), 'English transcript', md.texto.slice(0, 1500));

  await Promise.all([A.cerrar(), B.cerrar()]);
  fin();
}

main().catch((e) => { console.error(e); process.exit(2); });
