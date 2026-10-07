// hey Bro! — buzón compartido entre sesiones hermanas de Claude del mismo PC.
//
// Diseño:
//  - Cada sala es una carpeta:  <carpeta>/salas/<id>/
//      sala.json               metadatos (tema, objetivo, invitación…)
//      registro/000001.json     entradas de SOLO AÑADIR (un archivo por entrada)
//      presencia/<nombre>.json  cursor de lectura y última actividad de cada participante
//  - Todo cambio es una entrada nueva; el estado se obtiene "plegando" el registro.
//    La numeración se reserva creando el archivo en modo exclusivo ('wx'): varios procesos
//    pueden escribir a la vez sin cerrojos.
//  - Contadores compartidos (globales, no por sala): <carpeta>/contadores/<serie>/000001.json

import fs from 'node:fs';
import path from 'node:path';
import { claveRecurso, evaluarReservas, tendriaQueEsperar } from './reservas.js';

export { claveRecurso };

const PAD = 6;
const MS_ENTRADA_ROTA = 10_000;
export const EXTRA_POR_PARTICIPANTE = 20;
export const RESERVA_MIN_POR_DEFECTO = 240;
export const HUERFANA_H = 2; // una sala con un solo hermano esperando más de esto "espera ayuda"

export const CLASES_MENSAJE = [
  'mensaje', 'pregunta', 'respuesta', 'peticion', 'encargo', 'entrega', 'aviso', 'relevo', 'bitacora',
];
export const PREFIJO_ITEM = { tarea: 'T', reserva: 'R', decision: 'D' };
export const ESTADOS_ITEM = {
  tarea: ['pendiente', 'en_curso', 'bloqueada', 'hecha', 'descartada'],
  reserva: ['activa', 'liberada'],
  decision: ['propuesta', 'acordada', 'descartada'],
};
export const ESTADOS_CERRADOS = ['hecha', 'descartada', 'liberada', 'rechazada', 'caducada'];
export const CAMPOS_FICHA = [
  'tipo_sesion', 'papel', 'mision', 'capacidades', 'limites', 'necesito', 'ofrezco',
  'estado', 'disponibilidad', 'id_sesion',
];
export const CAMPOS_FICHA_OBLIGATORIOS = ['tipo_sesion', 'papel', 'mision', 'capacidades', 'limites'];
const CLASES_PARA_MODERADOR = ['pregunta', 'peticion'];
// Palabras que siempre se refieren al moderador o a todos: ningún hermano puede llamarse así.
export const ALIAS_MODERADOR = /^(moderador|moderadora|moderator|usuario|usuaria|user)$/i;
export const ALIAS_TODOS = /^(todos|todas|all|everyone)$/i;

export function slug(texto, max = 40) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function primeraLinea(texto, max = 90) {
  const l = String(texto ?? '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || '';
  const limpia = l.replace(/^#+\s*/, '').replace(/\*\*/g, '');
  return limpia.length > max ? `${limpia.slice(0, max - 1)}…` : limpia;
}

function esperaSincrona(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Escritura atómica (temporal + renombrar); en Windows se reintenta si el archivo está bloqueado.
export function escribirAtomico(archivo, datos) {
  const tmp = `${archivo}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, datos);
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, archivo);
      return;
    } catch (e) {
      if (i < 10 && ['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { esperaSincrona(20 * (i + 1)); continue; }
      try { fs.unlinkSync(tmp); } catch { /* nada */ }
      throw e;
    }
  }
}

export function leerJSON(archivo) {
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

export class ErrorBro extends Error {}

export class Almacen {
  constructor({ carpeta, moderador = 'Moderador', limitePorDefecto = 40, inactividadMin = 15, archivarDias = 7, T }) {
    this.carpeta = carpeta;
    this.dirSalas = path.join(carpeta, 'salas');
    this.dirContadores = path.join(carpeta, 'contadores');
    fs.mkdirSync(this.dirSalas, { recursive: true });
    this.moderador = moderador;
    this.limitePorDefecto = limitePorDefecto;
    this.inactividadMs = Math.max(1, inactividadMin) * 60_000;
    this.archivarMs = Math.max(1, archivarDias) * 86_400_000;
    this.T = T;
    this.cache = new Map();
  }

  esModerador(nombre) {
    return slug(nombre) === slug(this.moderador);
  }

  // ───────────────────────────── salas ─────────────────────────────

  rutaSala(id) { return path.join(this.dirSalas, id); }

  existeSala(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id)
      && fs.existsSync(path.join(this.rutaSala(id), 'sala.json'));
  }

  exigirSala(id) {
    if (!this.existeSala(id)) {
      const ids = this.listarSalas({ incluirCerradas: false }).map((s) => s.id);
      throw new ErrorBro(this.T.salaNoExiste(id, ids));
    }
  }

  crearSala({ tema, objetivo = '', nombre = '', limite, creador = null, papelInvitado = '', permanente = false }) {
    const base = slug(nombre || tema, 40) || 'sala';
    let id = base;
    for (let i = 2; ; i++) {
      try {
        fs.mkdirSync(this.rutaSala(id));
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        id = `${base}-${i}`;
        if (i > 999) throw new ErrorBro(this.T.sinIdLibre());
      }
    }
    const dir = this.rutaSala(id);
    fs.mkdirSync(path.join(dir, 'registro'));
    fs.mkdirSync(path.join(dir, 'presencia'));
    const meta = {
      id, tema, objetivo,
      creada: new Date().toISOString(),
      creador,
      limite_inicial: limite ?? this.limitePorDefecto,
      permanente: !!permanente,
      invitacion: this.T.invitacion({ id, tema, objetivo, papelInvitado }),
      version: 2,
    };
    escribirAtomico(path.join(dir, 'sala.json'), JSON.stringify(meta, null, 2));
    this.anotar(id, { tipo: 'sala', accion: 'creada', de: creador });
    return meta;
  }

  // Estado visible de una sala: abierta | pausada | cerrada | archivada (derivado: sin actividad)
  estadoVisible(st, ahora = Date.now()) {
    if (st.estado !== 'abierta' || st.permanente) return st.estado;
    return ahora - Date.parse(st.ultimaActividad) > this.archivarMs ? 'archivada' : st.estado;
  }

  listarSalas({ incluirCerradas = true } = {}) {
    const salas = [];
    let dirs = [];
    try { dirs = fs.readdirSync(this.dirSalas, { withFileTypes: true }); } catch { return salas; }
    const ahora = Date.now();
    for (const d of dirs) {
      if (!d.isDirectory() || !this.existeSala(d.name)) continue;
      try {
        const st = this.estadoSala(d.name);
        const visible = this.estadoVisible(st, ahora);
        if (!incluirCerradas && (visible === 'cerrada' || visible === 'archivada')) continue;
        salas.push({
          id: st.meta.id,
          tema: st.meta.tema,
          objetivo: st.meta.objetivo,
          estado: visible,
          permanente: st.permanente,
          mensajes: st.mensajes,
          limite: st.permanente ? null : st.limite,
          participantes: [...st.participantes.values()].map((p) => p.nombre),
          creada: st.meta.creada,
          ultimaActividad: st.ultimaActividad,
          pendientesModerador: this.pendientesModerador(st, ahora).filter((x) => x.estado === 'pendiente').length,
        });
      } catch { /* sala a medio crear o dañada */ }
    }
    salas.sort((a, b) => String(b.ultimaActividad).localeCompare(String(a.ultimaActividad)));
    return salas;
  }

  // ───────────────────────────── registro ─────────────────────────────

  anotar(id, datos) {
    const dirReg = path.join(this.rutaSala(id), 'registro');
    let n = this.maxNumero(dirReg) + 1;
    const { n: _n, t: _t, ...resto } = datos;
    for (let intento = 0; intento < 1000; intento++, n++) {
      const entrada = { n, t: new Date().toISOString(), ...resto };
      try {
        fs.writeFileSync(path.join(dirReg, `${String(n).padStart(PAD, '0')}.json`), JSON.stringify(entrada), { flag: 'wx' });
        return entrada;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
    throw new ErrorBro(this.T.registroColisiones());
  }

  maxNumero(dir) {
    let max = 0;
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d+)\.json$/.exec(f);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  }

  cacheDe(id) {
    let c = this.cache.get(id);
    if (!c) {
      c = { meta: null, mapa: new Map(), listoHasta: 0, estado: null, plegadoHasta: 0 };
      this.cache.set(id, c);
    }
    if (!c.meta) c.meta = leerJSON(path.join(this.rutaSala(id), 'sala.json'));
    return c;
  }

  refrescar(id) {
    const c = this.cacheDe(id);
    const dirReg = path.join(this.rutaSala(id), 'registro');
    let archivos = [];
    try { archivos = fs.readdirSync(dirReg); } catch { return c; }
    const numeros = new Set();
    for (const f of archivos) {
      const m = /^(\d+)\.json$/.exec(f);
      if (m) numeros.add(parseInt(m[1], 10));
    }
    for (const n of numeros) {
      if (c.mapa.has(n)) continue;
      const archivo = path.join(dirReg, `${String(n).padStart(PAD, '0')}.json`);
      try {
        c.mapa.set(n, leerJSON(archivo));
      } catch {
        let edad = 0;
        try { edad = Date.now() - fs.statSync(archivo).mtimeMs; } catch { /* nada */ }
        if (edad > MS_ENTRADA_ROTA) c.mapa.set(n, { n, tipo: 'rota' });
      }
    }
    let listo = c.listoHasta;
    for (;;) {
      const sig = listo + 1;
      if (c.mapa.has(sig)) { listo = sig; continue; }
      if (!numeros.has(sig)) {
        const vieja = [...numeros].some((x) => {
          if (x <= sig || !c.mapa.has(x)) return false;
          const e = c.mapa.get(x);
          return e.t && Date.now() - Date.parse(e.t) > MS_ENTRADA_ROTA;
        });
        if (vieja) { c.mapa.set(sig, { n: sig, tipo: 'rota' }); listo = sig; continue; }
      }
      break;
    }
    c.listoHasta = listo;
    return c;
  }

  entradasDesde(id, desde = 0) {
    const c = this.refrescar(id);
    const lista = [];
    for (let n = desde + 1; n <= c.listoHasta; n++) {
      const e = c.mapa.get(n);
      if (e && e.tipo !== 'rota') lista.push(e);
    }
    return lista;
  }

  // ───────────────────────────── estado plegado ─────────────────────────────

  estadoSala(id) {
    const c = this.refrescar(id);
    if (!c.estado) {
      c.estado = {
        meta: c.meta,
        estado: 'abierta',
        permanente: !!c.meta.permanente,
        limite: c.meta.limite_inicial,
        mensajes: 0,
        participantes: new Map(),
        tablero: new Map(),
        ultimaActividad: c.meta.creada,
        ultimaPor: new Map(),
        cierre: null,
        ultimoN: 0,
        paraModerador: [], // entradas pregunta/petición dirigidas al moderador
        moderadorMsgs: [], // { n, para }
        resueltos: new Map(), // n → { por: 'moderador' | 'hermano', t }
      };
      c.plegadoHasta = 0;
    }
    for (let n = c.plegadoHasta + 1; n <= c.listoHasta; n++) {
      const e = c.mapa.get(n);
      if (e && e.tipo !== 'rota') this.aplicar(c.estado, e);
    }
    c.plegadoHasta = c.listoHasta;
    return c.estado;
  }

  aplicar(st, e) {
    st.ultimoN = e.n;
    if (e.de) st.ultimaPor.set(slug(e.de), e.t);
    switch (e.tipo) {
      case 'sala':
        if (e.accion === 'pausada') st.estado = 'pausada';
        else if (e.accion === 'reanudada' && st.estado === 'pausada') st.estado = 'abierta';
        else if (e.accion === 'cerrada') { st.estado = 'cerrada'; st.cierre = { de: e.de, resumen: e.resumen || '', n: e.n, t: e.t }; }
        else if (e.accion === 'reabierta') st.estado = 'abierta';
        else if (e.accion === 'ampliada') st.limite += Number(e.cantidad) || 0;
        else if (e.accion === 'permanente') st.permanente = !!e.valor;
        st.ultimaActividad = e.t;
        break;
      case 'union': {
        const nuevo = !st.participantes.has(slug(e.de));
        st.participantes.set(slug(e.de), {
          nombre: e.de,
          ficha: { ...e.ficha },
          dossier: { texto: e.dossier || '', version: 1, t: e.t },
          unido_n: e.n,
          unido_t: e.t,
          actualizado_t: e.t,
        });
        if (nuevo && st.participantes.size > 2) st.limite += EXTRA_POR_PARTICIPANTE;
        st.ultimaActividad = e.t;
        break;
      }
      case 'ficha': {
        const p = st.participantes.get(slug(e.de));
        if (p) {
          if (e.cambios) Object.assign(p.ficha, e.cambios);
          if (typeof e.dossier === 'string') p.dossier = { texto: e.dossier, version: e.version || p.dossier.version + 1, t: e.t };
          p.actualizado_t = e.t;
        }
        st.ultimaActividad = e.t;
        break;
      }
      case 'mensaje':
        if (e.clase !== 'bitacora') st.mensajes += 1;
        if (e.clase === 'encargo' && Array.isArray(e.para) && e.para.length === 1) {
          const id = `T${e.n}`;
          st.tablero.set(id, {
            id, tipo: 'tarea', titulo: e.titulo || primeraLinea(e.texto), responsable: e.para[0],
            estado: 'pendiente', depende_de: [], notas: '', encargo_n: e.n,
            creado_por: e.de, creado_n: e.n, creado_t: e.t, actualizado_n: e.n, actualizado_t: e.t, historial: [],
          });
        }
        if (e.tarea && e.tarea.id) this.cambiarItem(st, e.tarea.id, { estado: e.tarea.estado }, e);
        if (CLASES_PARA_MODERADOR.includes(e.clase) && Array.isArray(e.para) && e.para.some((x) => this.esModerador(x))) {
          st.paraModerador.push(e);
        }
        if (Array.isArray(e.resuelve)) for (const r of e.resuelve) if (!st.resueltos.has(Number(r))) st.resueltos.set(Number(r), { por: 'hermano', t: e.t });
        st.ultimaActividad = e.t;
        break;
      case 'moderador':
        // Un mensaje del moderador resuelve lo que cita en «resuelve»; si no cita nada y va dirigido
        // a alguien, resuelve lo que esa persona le había preguntado antes. Un mensaje a todos no
        // resuelve nada por sí solo (puede ser un comentario general).
        st.moderadorMsgs.push({ n: e.n, para: e.para || null, conRef: Array.isArray(e.resuelve) && e.resuelve.length > 0 });
        if (Array.isArray(e.resuelve)) for (const r of e.resuelve) st.resueltos.set(Number(r), { por: 'moderador', t: e.t });
        st.ultimaActividad = e.t;
        break;
      case 'resuelto':
        st.resueltos.set(Number(e.ref), { por: 'moderador', t: e.t });
        break;
      case 'numero':
        st.ultimaActividad = e.t;
        break;
      case 'tablero':
        this.aplicarTablero(st, e);
        st.ultimaActividad = e.t;
        break;
      default:
        break;
    }
  }

  cambiarItem(st, id, cambios, e) {
    const item = st.tablero.get(id);
    if (!item) return;
    const limpios = {};
    for (const [k, v] of Object.entries(cambios || {})) if (v !== undefined) limpios[k] = v;
    if (item.tipo === 'reserva') {
      delete limpios.titulo; // el recurso de una reserva no cambia
      if (limpios.estado === 'liberada' || limpios.estado === 'activa') this.cambioReserva(item, limpios.estado, e.t, e.n);
    }
    Object.assign(item, limpios);
    item.actualizado_n = e.n;
    item.actualizado_t = e.t;
    item.historial.push({ n: e.n, t: e.t, de: e.de, cambios: limpios });
  }

  // Liberar cierra el periodo vigente; «activa» lo renueva o, si ya terminó, abre uno nuevo.
  cambioReserva(item, estado, t, n) {
    if (!Array.isArray(item.periodos)) item.periodos = [];
    const ultimo = item.periodos[item.periodos.length - 1];
    if (estado === 'liberada') {
      if (ultimo && !ultimo.liberado_t) ultimo.liberado_t = t;
      return;
    }
    const dur = (Number(item.duracion_min) || RESERVA_MIN_POR_DEFECTO) * 60_000;
    const baseUltimo = ultimo ? Math.max(Date.parse(ultimo.pedido_t), ...ultimo.renov.map((r) => Date.parse(r))) : 0;
    if (!ultimo || ultimo.liberado_t || Date.parse(t) > baseUltimo + dur) {
      item.periodos.push({ pedido_t: t, n, renov: [], liberado_t: null });
    } else {
      ultimo.renov.push(t);
    }
  }

  aplicarTablero(st, e) {
    if (e.accion === 'nuevo') {
      const it = e.item || {};
      const id = `${PREFIJO_ITEM[it.tipo] || 'X'}${e.n}`;
      const item = {
        id,
        tipo: it.tipo,
        titulo: it.titulo,
        responsable: it.tipo === 'reserva' ? e.de : (it.responsable || e.de),
        estado: it.estado || (it.tipo === 'tarea' ? 'pendiente' : it.tipo === 'reserva' ? 'activa' : 'propuesta'),
        depende_de: Array.isArray(it.depende_de) ? it.depende_de : [],
        notas: it.notas || '',
        creado_por: e.de, creado_n: e.n, creado_t: e.t, actualizado_n: e.n, actualizado_t: e.t, historial: [],
      };
      if (item.tipo === 'reserva') {
        item.modo = it.modo === 'compartida' ? 'compartida' : 'exclusiva';
        item.duracion_min = Number(it.duracion_min) || RESERVA_MIN_POR_DEFECTO;
        item.esperar_turno = !!it.esperar_turno;
        item.periodos = [{ pedido_t: e.t, n: e.n, renov: [], liberado_t: null }];
        const otras = [...st.tablero.values()].filter((x) => x.tipo === 'reserva');
        if (!item.esperar_turno && tendriaQueEsperar(otras, item, e.t)) {
          const ev = evaluarReservas([...otras, item], Date.parse(e.t)).get(id);
          const quien = (ev?.delante || []).map((x) => `${x} (${st.tablero.get(x)?.responsable || '?'})`).join(', ');
          item.estado = 'rechazada';
          item.periodos = [];
          item.notas = `${this.T.conflictoReserva(quien)}${item.notas ? ` ${item.notas}` : ''}`;
        }
      }
      st.tablero.set(id, item);
    } else if (e.accion === 'cambio') {
      this.cambiarItem(st, e.id, e.cambios, e);
    }
  }

  // Estado visible de un elemento del tablero (las reservas se evalúan con la hora actual).
  reservasEvaluadas(st, ahora = Date.now()) {
    return evaluarReservas([...st.tablero.values()], ahora);
  }

  estadoItem(st, item, ev = null, ahora = Date.now()) {
    if (item.tipo !== 'reserva') return item.estado;
    const r = (ev || this.reservasEvaluadas(st, ahora)).get(item.id);
    return r ? r.estado : item.estado;
  }

  // ───────────────────────────── bandeja del moderador ─────────────────────────────

  // Preguntas y peticiones dirigidas al moderador, con su situación.
  pendientesModerador(st, ahora = Date.now()) {
    const lista = [];
    for (const e of st.paraModerador) {
      // pendiente | vencida (pasó el plazo y el hermano aún no lo ha anotado) |
      // decidida (el hermano aplicó su opción por defecto tras el plazo) | resuelta
      let estado = 'pendiente';
      const res = st.resueltos.get(e.n);
      const vence = e.plazo_min ? Date.parse(e.t) + e.plazo_min * 60_000 : null;
      if (res?.por === 'moderador') estado = 'resuelta';
      else if (st.moderadorMsgs.some((m) => m.n > e.n && !m.conRef && m.para && m.para.some((x) => slug(x) === slug(e.de)))) estado = 'resuelta';
      else if (res) estado = vence && Date.parse(res.t) >= vence ? 'decidida' : 'resuelta';
      else if (vence && ahora > vence) estado = 'vencida';
      lista.push({
        sala: st.meta.id, tema: st.meta.tema, n: e.n, t: e.t, de: e.de, clase: e.clase,
        titulo: e.titulo || '', texto: e.texto, por_defecto: e.por_defecto || '', plazo_min: e.plazo_min || null,
        vence_t: e.plazo_min ? new Date(Date.parse(e.t) + e.plazo_min * 60_000).toISOString() : null,
        estado,
      });
    }
    return lista;
  }

  // Salas de tarea en las que alguien espera a un hermano que no llega.
  huerfanas(ahora = Date.now()) {
    const res = [];
    let dirs = [];
    try { dirs = fs.readdirSync(this.dirSalas, { withFileTypes: true }); } catch { return res; }
    for (const d of dirs) {
      if (!d.isDirectory() || !this.existeSala(d.name)) continue;
      let st;
      try { st = this.estadoSala(d.name); } catch { continue; }
      if (st.estado !== 'abierta' || st.permanente || st.participantes.size !== 1) continue;
      const entradas = this.entradasDesde(d.name, 0);
      const ultima = [...entradas].reverse().find((e) => e.tipo === 'mensaje' && e.clase !== 'bitacora');
      if (!ultima || ahora - Date.parse(ultima.t) < HUERFANA_H * 3_600_000) continue;
      const solo = [...st.participantes.values()][0];
      res.push({ sala: st.meta.id, tema: st.meta.tema, de: solo.nombre, n: ultima.n, t: ultima.t, texto: primeraLinea(ultima.texto, 160), invitacion: st.meta.invitacion, archivada: this.estadoVisible(st, ahora) === 'archivada' });
    }
    return res.sort((a, b) => b.t.localeCompare(a.t));
  }

  bandeja(ahora = Date.now()) {
    const pendientes = [];
    const vencidas = [];
    let dirs = [];
    try { dirs = fs.readdirSync(this.dirSalas, { withFileTypes: true }); } catch { dirs = []; }
    for (const d of dirs) {
      if (!d.isDirectory() || !this.existeSala(d.name)) continue;
      let st;
      try { st = this.estadoSala(d.name); } catch { continue; }
      if (st.estado === 'cerrada') continue;
      for (const x of this.pendientesModerador(st, ahora)) {
        if (x.estado === 'pendiente') pendientes.push(x);
        else if ((x.estado === 'vencida' || x.estado === 'decidida') && ahora - Date.parse(x.vence_t) < 86_400_000) vencidas.push(x);
      }
    }
    pendientes.sort((a, b) => a.t.localeCompare(b.t));
    vencidas.sort((a, b) => b.t.localeCompare(a.t));
    return { pendientes, vencidas, huerfanas: this.huerfanas(ahora) };
  }

  // ───────────────────────────── presencia ─────────────────────────────

  rutaPresencia(id, nombre) {
    return path.join(this.rutaSala(id), 'presencia', `${slug(nombre) || 'anon'}.json`);
  }

  leerPresencia(id, nombre) {
    try { return leerJSON(this.rutaPresencia(id, nombre)); } catch { return null; }
  }

  guardarPresencia(id, nombre, datos) {
    escribirAtomico(this.rutaPresencia(id, nombre), JSON.stringify(datos));
  }

  presenciaDe(id, nombre, ahora = Date.now()) {
    const p = this.leerPresencia(id, nombre);
    if (!p) return { estado: 'inactivo', ultimo_visto: null };
    const hasta = p.escuchando_hasta ? Date.parse(p.escuchando_hasta) : 0;
    const visto = p.ultimo_visto ? Date.parse(p.ultimo_visto) : 0;
    if (hasta > ahora) return { estado: 'escuchando', ultimo_visto: p.ultimo_visto };
    if (ahora - visto < 5 * 60_000) return { estado: 'activo', ultimo_visto: p.ultimo_visto };
    return { estado: 'inactivo', ultimo_visto: p.ultimo_visto };
  }

  // ───────────────────────────── acciones del moderador (visor) ─────────────────────────────

  mensajeModerador(id, texto, para = null, resuelve = null) {
    this.exigirSala(id);
    const st = this.estadoSala(id);
    if (st.estado === 'cerrada') throw new ErrorBro(this.T.salaCerradaReabre());
    const limpio = String(texto ?? '').trim();
    if (!limpio) throw new ErrorBro(this.T.mensajeVacio());
    if (limpio.length > 20_000) throw new ErrorBro(this.T.mensajeLargo(20_000));
    const destinatarios = this.normalizarPara(st, para, { permitirModerador: false });
    const entrada = { tipo: 'moderador', de: this.moderador, texto: limpio, para: destinatarios };
    if (resuelve !== null && resuelve !== undefined) {
      const refs = (Array.isArray(resuelve) ? resuelve : [resuelve]).slice(0, 20).map(Number).filter(Number.isInteger);
      for (const n of refs) if (!st.paraModerador.some((e) => e.n === n)) throw new ErrorBro(this.T.noHayPregunta(n));
      if (refs.length) entrada.resuelve = refs;
    }
    return this.anotar(id, entrada);
  }

  accionModerador(id, accion, cantidad = 10, ref = null) {
    this.exigirSala(id);
    const st = this.estadoSala(id);
    const de = this.moderador;
    switch (accion) {
      case 'pausar':
        if (st.estado !== 'abierta') throw new ErrorBro(this.T.soloPausarAbierta());
        return this.anotar(id, { tipo: 'sala', accion: 'pausada', de });
      case 'reanudar':
        if (st.estado !== 'pausada') throw new ErrorBro(this.T.noEnPausa());
        return this.anotar(id, { tipo: 'sala', accion: 'reanudada', de });
      case 'cerrar':
        if (st.estado === 'cerrada') throw new ErrorBro(this.T.yaCerrada());
        return this.anotar(id, { tipo: 'sala', accion: 'cerrada', de, resumen: '' });
      case 'reabrir':
        if (st.estado !== 'cerrada') throw new ErrorBro(this.T.noCerrada());
        return this.anotar(id, { tipo: 'sala', accion: 'reabierta', de });
      case 'ampliar': {
        const c = Math.max(1, Math.min(500, Math.round(Number(cantidad) || 10)));
        return this.anotar(id, { tipo: 'sala', accion: 'ampliada', de, cantidad: c });
      }
      case 'permanente':
      case 'temporal':
        return this.anotar(id, { tipo: 'sala', accion: 'permanente', valor: accion === 'permanente', de });
      case 'resolver': {
        const n = Number(ref);
        if (!st.paraModerador.some((e) => e.n === n)) throw new ErrorBro(this.T.noHayPregunta(n));
        return this.anotar(id, { tipo: 'resuelto', de, ref: n });
      }
      default:
        throw new ErrorBro(this.T.accionDesconocida(accion));
    }
  }

  // ───────────────────────────── contadores compartidos ─────────────────────────────

  rutaSerie(serie) {
    const s = slug(serie, 40);
    if (!s) throw new ErrorBro(this.T.serieInvalida());
    return path.join(this.dirContadores, s);
  }

  metaSerie(serie) {
    try { return leerJSON(path.join(this.rutaSerie(serie), 'serie.json')); } catch { return null; }
  }

  // Reserva números de una serie sin choques entre procesos (archivo exclusivo por número).
  tomarNumeros({ serie, de, sala = null, motivo = '', cantidad = 1, empezarEn = null, prefijo = null }) {
    const dir = this.rutaSerie(serie);
    fs.mkdirSync(dir, { recursive: true });
    let meta = this.metaSerie(serie);
    if (!meta) {
      meta = { serie, prefijo: prefijo || '', empezar_en: empezarEn || 1, creada: new Date().toISOString(), creada_por: de };
      try { fs.writeFileSync(path.join(dir, 'serie.json'), JSON.stringify(meta, null, 2), { flag: 'wx' }); } catch { meta = this.metaSerie(serie) || meta; }
    }
    const tomados = [];
    let n = Math.max(this.maxNumero(dir) + 1, Number(meta.empezar_en) || 1, Number(empezarEn) || 1);
    for (let intento = 0; tomados.length < cantidad && intento < 5000; intento++, n++) {
      const registro = { n, serie: meta.serie, etiqueta: `${meta.prefijo || ''}${n}`, t: new Date().toISOString(), de, sala, motivo };
      try {
        fs.writeFileSync(path.join(dir, `${String(n).padStart(PAD, '0')}.json`), JSON.stringify(registro), { flag: 'wx' });
        tomados.push(registro);
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
    return { meta, tomados };
  }

  verSerie(serie, ultimos = 10) {
    const meta = this.metaSerie(serie);
    if (!meta) return { meta: null, registros: [], siguiente: null };
    const dir = this.rutaSerie(serie);
    const numeros = fs.readdirSync(dir).map((f) => /^(\d+)\.json$/.exec(f)).filter(Boolean).map((m) => parseInt(m[1], 10)).sort((a, b) => a - b);
    const registros = numeros.slice(-ultimos).map((n) => {
      try { return leerJSON(path.join(dir, `${String(n).padStart(PAD, '0')}.json`)); } catch { return { n, etiqueta: `${meta.prefijo || ''}${n}` }; }
    });
    const max = numeros.length ? numeros[numeros.length - 1] : 0;
    const sig = Math.max(max + 1, Number(meta.empezar_en) || 1);
    return { meta, registros, siguiente: `${meta.prefijo || ''}${sig}` };
  }

  listarSeries() {
    try {
      return fs.readdirSync(this.dirContadores, { withFileTypes: true }).filter((d) => d.isDirectory())
        .map((d) => { try { return leerJSON(path.join(this.dirContadores, d.name, 'serie.json')); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }

  // ───────────────────────────── utilidades ─────────────────────────────

  normalizarPara(st, para, { permitirModerador = true } = {}) {
    if (para === undefined || para === null || para === '') return null;
    const lista = (Array.isArray(para) ? para : String(para).split(','))
      .map((x) => String(x).trim()).filter(Boolean);
    if (!lista.length) return null;
    const resultado = [];
    for (const nombre of lista) {
      if (ALIAS_TODOS.test(nombre)) return null;
      const alias = ALIAS_MODERADOR.test(nombre) && !st.participantes.has(slug(nombre));
      if (permitirModerador && (this.esModerador(nombre) || alias)) {
        if (!resultado.includes(this.moderador)) resultado.push(this.moderador);
        continue;
      }
      const p = st.participantes.get(slug(nombre));
      if (!p) {
        const nombres = [...st.participantes.values()].map((x) => x.nombre);
        if (permitirModerador) nombres.push(this.T.etiquetaModerador(this.moderador));
        throw new ErrorBro(this.T.nadieLlamado(nombre, nombres));
      }
      if (!resultado.includes(p.nombre)) resultado.push(p.nombre);
    }
    return resultado.length ? resultado : null;
  }
}
