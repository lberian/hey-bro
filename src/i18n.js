// Idioma de hey Bro!: nombres de herramientas y parámetros en inglés ↔ español,
// sinónimos de valores (se aceptan siempre los dos idiomas) y detección automática.

export function detectarIdioma(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('en')) return 'en';
  let loc = '';
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* nada */ }
  const env = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
  return /^es/i.test(loc) || /^es/i.test(env) ? 'es' : 'en';
}

// Nombre canónico (español) → nombre en inglés.
export const NOMBRE_EN = {
  bro_crear_sala: 'bro_create_room',
  bro_unirse: 'bro_join',
  bro_actualizar: 'bro_update',
  bro_enviar: 'bro_send',
  bro_esperar: 'bro_wait',
  bro_tablero: 'bro_board',
  bro_numero: 'bro_number',
  bro_contexto: 'bro_context',
  bro_historial: 'bro_history',
  bro_salas: 'bro_rooms',
  bro_cerrar: 'bro_close',
  bro_visor: 'bro_viewer',
};
export const NOMBRE_ES = Object.fromEntries(Object.entries(NOMBRE_EN).map(([es, en]) => [en, es]));

// Parámetro en inglés → canónico.
export const PARAM_ES = {
  room: 'sala', me: 'yo', topic: 'tema', goal: 'objetivo', name: 'nombre', message_limit: 'limite_mensajes',
  guest_role: 'papel_invitado', permanent: 'permanente', profile: 'ficha', resume: 'retomar',
  append_to_dossier: 'anadir_al_dossier', change_summary: 'resumen_cambios', room_permanent: 'sala_permanente',
  text: 'texto', kind: 'clase', to: 'para', title: 'titulo', origin: 'origen', task: 'tarea',
  wait_seconds: 'esperar_segundos', default: 'por_defecto', deadline_min: 'plazo_min', resolves: 'resuelve',
  seconds: 'segundos', new: 'nuevo', change: 'cambiar', show_all: 'todo', series: 'serie', reason: 'motivo',
  count: 'cantidad', start_at: 'empezar_en', prefix: 'prefijo', peek: 'solo_ver', who: 'de', log_entries: 'bitacora',
  since: 'desde', last: 'ultimos', include_log: 'incluir_bitacora', include_closed: 'incluir_cerradas',
  summary: 'resumen', open: 'abrir',
  // ficha
  session_type: 'tipo_sesion', role: 'papel', mission: 'mision', capabilities: 'capacidades', limits: 'limites',
  needs: 'necesito', offers: 'ofrezco', status: 'estado', availability: 'disponibilidad', session_id: 'id_sesion',
  // tablero
  type: 'tipo', owner: 'responsable', depends_on: 'depende_de', notes: 'notas', expires_min: 'caduca_min',
  mode: 'modo', queue: 'esperar_turno',
};
export const PARAM_EN = Object.fromEntries(Object.entries(PARAM_ES).map(([en, es]) => [es, en]));

export function normalizarArgs(valor) {
  if (Array.isArray(valor)) return valor.map(normalizarArgs);
  if (!valor || typeof valor !== 'object') return valor;
  const res = {};
  for (const [k, v] of Object.entries(valor)) {
    const canon = PARAM_ES[k] || k;
    if (res[canon] === undefined) res[canon] = normalizarArgs(v);
  }
  return res;
}

// Valores: sinónimos aceptados → canónico.
const SINONIMOS = {
  clase: {
    message: 'mensaje', question: 'pregunta', answer: 'respuesta', reply: 'respuesta', request: 'peticion',
    assignment: 'encargo', delivery: 'entrega', notice: 'aviso', alert: 'aviso',
    handoff: 'relevo', log: 'bitacora',
  },
  tipo: { task: 'tarea', reservation: 'reserva', lock: 'reserva', decision: 'decision' },
  estado: {
    pending: 'pendiente', in_progress: 'en_curso', blocked: 'bloqueada',
    done: 'hecha', discarded: 'descartada', cancelled: 'descartada', canceled: 'descartada', active: 'activa',
    released: 'liberada', proposed: 'propuesta', agreed: 'acordada',
  },
  modo: { exclusive: 'exclusiva', shared: 'compartida' },
};
export function normalizarEnum(campo, valor) {
  // Tolera acentos, mayúsculas, espacios y guiones: «Petición», «en curso», «in-progress»…
  const v = String(valor ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
  return SINONIMOS[campo]?.[v] || v;
}

// Valores canónicos → inglés (para mostrarlos y para los esquemas en inglés).
// Valores canónicos → cómo se muestran en español (los canónicos no llevan tildes).
export const VALOR_ES = { peticion: 'petición', decision: 'decisión', bitacora: 'bitácora' };

export const VALOR_EN = {
  mensaje: 'message', pregunta: 'question', respuesta: 'answer', peticion: 'request', encargo: 'assignment',
  entrega: 'delivery', aviso: 'notice', relevo: 'handoff', bitacora: 'log',
  tarea: 'task', reserva: 'reservation', decision: 'decision',
  pendiente: 'pending', en_curso: 'in_progress', bloqueada: 'blocked', hecha: 'done', descartada: 'discarded',
  activa: 'active', liberada: 'released', rechazada: 'rejected', caducada: 'expired', en_cola: 'queued',
  propuesta: 'proposed', acordada: 'agreed', exclusiva: 'exclusive', compartida: 'shared',
  abierta: 'open', pausada: 'paused', cerrada: 'closed', archivada: 'archived',
  creada: 'created', reanudada: 'resumed', reabierta: 'reopened', ampliada: 'limit raised', permanente: 'permanent', temporal: 'temporary',
};
