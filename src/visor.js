// Visor web local de hey Bro!: http://127.0.0.1:4520/
// Solo escucha en 127.0.0.1. Protecciones: cabecera Host (evita DNS rebinding), cabecera
// X-HeyBro y Origin en los POST (una web cualquiera no puede escribir en las salas).
// El proceso que sirve el visor es también el que lanza los avisos del sistema al moderador.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ErrorBro, escribirAtomico, leerJSON, slug } from './almacen.js';
import { mostrarAviso } from './avisos.js';
import { VALOR_EN, VALOR_ES } from './i18n.js';

function leerCuerpo(req, max, T) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      datos += c;
      if (datos.length > max) { reject(new ErrorBro(T.mensajeLargo(max))); req.destroy(); }
    });
    req.on('end', () => resolve(datos));
    req.on('error', reject);
  });
}

const ERRORES_HTTP = {
  es: { host: 'Host no permitido', participante: 'Participante no encontrado', noEncontrado: 'No encontrado', cabecera: 'Falta la cabecera X-HeyBro', origen: 'Origen no permitido', json: 'Se espera JSON', metodo: 'Método no permitido', interno: 'Error interno' },
  en: { host: 'Host not allowed', participante: 'Participant not found', noEncontrado: 'Not found', cabecera: 'Missing X-HeyBro header', origen: 'Origin not allowed', json: 'JSON expected', metodo: 'Method not allowed', interno: 'Internal error' },
};

export class Visor {
  get err() { return ERRORES_HTTP[this.ctx.idioma] || ERRORES_HTTP.es; }

  constructor(ctx, { puerto = 4520, html = '', version = '0', avisos = true, formatearTablero = null, hora = null } = {}) {
    this.ctx = ctx;
    this.puertoBase = puerto;
    this.html = html;
    this.version = version;
    this.avisos = avisos;
    this.formatearTablero = formatearTablero;
    this.hora = hora || ((iso) => String(iso));
    this.servidor = null;
    this.url = null;
    this._asegurando = null;
    this._avisando = false;
    this._ultimoAviso = 0;
  }

  get T() { return this.ctx.T; }

  ping(puerto) {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: puerto, path: '/api/ping', timeout: 800, headers: { Host: `127.0.0.1:${puerto}` } }, (res) => {
        let datos = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { datos += c; if (datos.length > 10_000) req.destroy(); });
        res.on('end', () => { try { resolve(JSON.parse(datos)); } catch { resolve({ ajeno: true }); } });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ajeno: true }); });
      req.on('error', (e) => resolve(e.code === 'ECONNREFUSED' ? null : { ajeno: true }));
    });
  }

  escuchar(puerto) {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => { this.atender(req, res, puerto); });
      srv.once('error', () => resolve(false));
      srv.listen(puerto, '127.0.0.1', () => {
        this.servidor = srv;
        srv.unref();
        this.arrancarAvisos();
        resolve(true);
      });
    });
  }

  asegurar() {
    if (this.servidor) return Promise.resolve(this.url);
    if (this._asegurando) return this._asegurando;
    this._asegurando = (async () => {
      for (let p = this.puertoBase; p < this.puertoBase + 10; p++) {
        const info = await this.ping(p);
        if (info && info.app === 'hey-bro' && info.carpeta === this.ctx.almacen.carpeta) {
          this.url = `http://127.0.0.1:${p}/`;
          return this.url;
        }
        if (info) continue;
        if (await this.escuchar(p)) {
          this.url = `http://127.0.0.1:${p}/`;
          return this.url;
        }
      }
      return null;
    })().finally(() => { this._asegurando = null; });
    return this._asegurando;
  }

  abrirNavegador(url) {
    return new Promise((resolve) => {
      if (!/^http:\/\/127\.0\.0\.1:\d+\/(#[a-z0-9-]*)?$/.test(url)) { resolve(false); return; }
      let cmd;
      let args;
      if (process.platform === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '""', url]; }
      else if (process.platform === 'darwin') { cmd = 'open'; args = [url]; }
      else { cmd = 'xdg-open'; args = [url]; }
      try {
        const hijo = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32', windowsHide: true });
        hijo.on('error', () => resolve(false));
        hijo.unref();
        setTimeout(() => resolve(true), 300);
      } catch {
        resolve(false);
      }
    });
  }

  // ───────────────────────────── avisos al moderador ─────────────────────────────

  rutaAvisos() { return path.join(this.ctx.almacen.carpeta, 'avisos.json'); }

  arrancarAvisos() {
    if (!this.avisos || this._timerAvisos) return;
    this._timerAvisos = setInterval(() => { this.revisarAvisos().catch(() => {}); }, 6000);
    this._timerAvisos.unref();
    setTimeout(() => { this.revisarAvisos().catch(() => {}); }, 1500).unref();
  }

  async revisarAvisos() {
    if (this._avisando || !this.servidor) return;
    this._avisando = true;
    try {
      const { pendientes } = this.ctx.almacen.bandeja();
      let hechos = [];
      try { hechos = leerJSON(this.rutaAvisos()).avisados || []; } catch { hechos = []; }
      const ya = new Set(hechos);
      const nuevos = pendientes.filter((x) => !ya.has(`${x.sala}#${x.n}`));
      if (!nuevos.length) return;
      if (Date.now() - this._ultimoAviso < 20_000) return; // como mucho un aviso cada 20 s; el resto se agrupa
      const T = this.T;
      let aviso;
      if (nuevos.length === 1) {
        const x = nuevos[0];
        const resumen = (x.titulo || x.texto || '').split(/\r?\n/).find((l) => l.trim()) || '';
        aviso = {
          titulo: T.avisoTitulo(x.sala),
          texto: x.clase === 'peticion' ? T.avisoPeticion(x.de, resumen.slice(0, 180)) : T.avisoPregunta(x.de, resumen.slice(0, 180)),
          detalle: x.vence_t ? T.avisoPorDefecto(this.hora(x.vence_t), (x.por_defecto || '').slice(0, 120)) : '',
          url: `${this.url}#${x.sala}`,
        };
      } else {
        aviso = { titulo: 'hey Bro!', texto: T.avisoVarios(nuevos.length), detalle: T.avisoVariosDetalle(), url: this.url };
      }
      this._ultimoAviso = Date.now();
      await mostrarAviso(aviso);
      const todos = [...hechos, ...nuevos.map((x) => `${x.sala}#${x.n}`)].slice(-1000);
      escribirAtomico(this.rutaAvisos(), JSON.stringify({ avisados: todos }, null, 1));
    } finally {
      this._avisando = false;
    }
  }

  // ───────────────────────────── HTTP ─────────────────────────────

  responder(res, estado, cuerpo, tipo = 'application/json; charset=utf-8') {
    const datos = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    res.writeHead(estado, {
      'Content-Type': tipo,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(datos);
  }

  async atender(req, res, puerto) {
    try {
      const host = String(req.headers.host || '');
      if (host !== `127.0.0.1:${puerto}` && host !== `localhost:${puerto}`) {
        this.responder(res, 403, { error: this.err.host });
        return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${puerto}`);
      const ruta = url.pathname;
      const a = this.ctx.almacen;

      if (req.method === 'GET') {
        if (ruta === '/' || ruta === '/index.html') {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          });
          res.end(this.html.replace('<html lang="es">', `<html lang="${this.ctx.idioma}">`));
          return;
        }
        if (ruta === '/api/ping') {
          this.responder(res, 200, { app: 'hey-bro', version: this.version, carpeta: a.carpeta, moderador: a.moderador, idioma: this.ctx.idioma, avisos: this.avisos });
          return;
        }
        if (ruta === '/api/salas') {
          this.responder(res, 200, { salas: a.listarSalas({ incluirCerradas: true }), moderador: a.moderador, version: this.version, idioma: this.ctx.idioma });
          return;
        }
        if (ruta === '/api/bandeja') {
          this.responder(res, 200, a.bandeja());
          return;
        }
        let m = /^\/api\/salas\/([a-z0-9-]{1,60})$/.exec(ruta);
        if (m) {
          this.responder(res, 200, this.vistaSala(m[1], Number(url.searchParams.get('desde')) || 0));
          return;
        }
        m = /^\/api\/salas\/([a-z0-9-]{1,60})\/dossier$/.exec(ruta);
        if (m) {
          a.exigirSala(m[1]);
          const st = a.estadoSala(m[1]);
          const p = st.participantes.get(slug(url.searchParams.get('de') || ''));
          if (!p) { this.responder(res, 404, { error: this.err.participante }); return; }
          this.responder(res, 200, { nombre: p.nombre, dossier: p.dossier });
          return;
        }
        m = /^\/api\/salas\/([a-z0-9-]{1,60})\/transcripcion\.md$/.exec(ruta);
        if (m) {
          a.exigirSala(m[1]);
          res.writeHead(200, {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="heybro-${m[1]}.md"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(this.transcripcion(m[1]));
          return;
        }
        this.responder(res, 404, { error: this.err.noEncontrado });
        return;
      }

      if (req.method === 'POST') {
        if (req.headers['x-heybro'] !== '1') { this.responder(res, 403, { error: this.err.cabecera }); return; }
        const origen = req.headers.origin;
        if (origen && origen !== `http://127.0.0.1:${puerto}` && origen !== `http://localhost:${puerto}`) {
          this.responder(res, 403, { error: this.err.origen });
          return;
        }
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
          this.responder(res, 415, { error: this.err.json });
          return;
        }
        const datos = JSON.parse((await leerCuerpo(req, 256 * 1024, this.T)) || '{}');
        let m = /^\/api\/salas\/([a-z0-9-]{1,60})\/mensaje$/.exec(ruta);
        if (m) {
          const e = a.mensajeModerador(m[1], datos.texto, datos.para || null, datos.resuelve ?? null);
          this.responder(res, 200, { ok: true, n: e.n });
          return;
        }
        m = /^\/api\/salas\/([a-z0-9-]{1,60})\/accion$/.exec(ruta);
        if (m) {
          const e = a.accionModerador(m[1], String(datos.accion || ''), datos.cantidad, datos.ref);
          this.responder(res, 200, { ok: true, n: e.n });
          return;
        }
        this.responder(res, 404, { error: this.err.noEncontrado });
        return;
      }
      this.responder(res, 405, { error: this.err.metodo });
    } catch (e) {
      const esNuestro = e instanceof ErrorBro || e instanceof SyntaxError;
      if (!esNuestro) console.error('[hey-bro visor]', e);
      this.responder(res, esNuestro ? 400 : 500, { error: esNuestro ? e.message : this.err.interno });
    }
  }

  vistaSala(id, desde) {
    const a = this.ctx.almacen;
    a.exigirSala(id);
    const st = a.estadoSala(id);
    const ev = a.reservasEvaluadas(st);
    const aligerar = (e) => {
      if (typeof e.dossier !== 'string') return e;
      const { dossier, ...resto } = e;
      return { ...resto, dossier_len: dossier.length };
    };
    return {
      meta: st.meta,
      estado: a.estadoVisible(st),
      permanente: st.permanente,
      limite: st.permanente ? null : st.limite,
      mensajes: st.mensajes,
      ultimoN: st.ultimoN,
      cierre: st.cierre,
      moderador: a.moderador,
      participantes: [...st.participantes.values()].map((p) => ({
        nombre: p.nombre,
        ficha: p.ficha,
        dossier: { version: p.dossier?.version || 1, t: p.dossier?.t, longitud: (p.dossier?.texto || '').length },
        unido_t: p.unido_t,
        actualizado_t: p.actualizado_t,
        presencia: a.presenciaDe(id, p.nombre),
      })),
      tablero: [...st.tablero.values()].map((it) => {
        const { periodos, historial, ...resto } = it;
        if (it.tipo !== 'reserva') return resto;
        const r = ev.get(it.id);
        return { ...resto, estado: r?.estado || it.estado, inicio: r?.inicio || null, fin: r?.fin || null, posicion: r?.posicion || null, delante: r?.delante || [] };
      }),
      pendientes: a.pendientesModerador(st).filter((x) => x.estado !== 'resuelta'),
      entradas: a.entradasDesde(id, Math.max(0, desde)).map(aligerar),
    };
  }

  transcripcion(id) {
    const a = this.ctx.almacen;
    const T = this.T;
    const en = this.ctx.idioma === 'en';
    const V = (v) => (en ? (VALOR_EN[v] || v) : (VALOR_ES[v] || String(v).replace(/_/g, ' ')));
    const hora = this.hora;
    const st = a.estadoSala(id);
    const cuenta = st.permanente ? T.mensajesSinLimite(st.mensajes) : T.mensajesCuenta(st.mensajes, st.limite);
    const l = [T.trTitulo(st.meta.tema), ''];
    l.push(T.trCabecera(st.meta.id, hora(st.meta.creada), V(a.estadoVisible(st)), cuenta));
    if (st.meta.objetivo) l.push(T.trObjetivo(st.meta.objetivo));
    l.push('', `## ${T.trParticipantes()}`, '');
    for (const p of st.participantes.values()) {
      l.push(`### ${p.nombre} (${p.ficha.tipo_sesion || T.sesion()})`, '');
      for (const [k, v] of Object.entries(p.ficha)) l.push(`- **${T.campo(k)}**: ${v}`);
      l.push('', `**${T.dossierDe(p.nombre)} · v${p.dossier?.version || 1}**`, '', p.dossier?.texto || T.vacio(), '');
    }
    l.push(`## ${T.trRegistro()}`, '');
    for (const e of a.entradasDesde(id, 0)) {
      const cuando = hora(e.t);
      if (e.tipo === 'mensaje' || e.tipo === 'moderador') {
        const para = e.para?.length ? ` → ${e.para.join(', ')}` : '';
        const clase = e.tipo === 'moderador' ? (en ? 'moderator' : 'moderador') : V(e.clase);
        const resp = e.tipo === 'moderador' && Array.isArray(e.resuelve) && e.resuelve.length ? ` · ${T.respondeA(e.resuelve.map((x) => `#${x}`).join(', '))}` : '';
        l.push(`**#${e.n} · ${e.de}${para} · ${clase} · ${cuando}**${e.tarea ? ` · ${e.tarea.id} → ${V(e.tarea.estado)}` : ''}${resp}`, '');
        if (e.titulo) l.push(`*${e.titulo}*`, '');
        if (e.origen) l.push(`> ${T.trPeticionOriginal()}: ${e.origen.replace(/\n/g, '\n> ')}`, '');
        l.push(e.texto, '');
        if (e.por_defecto) l.push(`> ${T.porDefectoLinea(e.por_defecto, null)}`, '');
      } else if (e.tipo === 'union') {
        l.push(`*${T.trSeUne(e.n, cuando, `${e.de} (${e.ficha?.papel || ''})`)}*`, '');
      } else if (e.tipo === 'ficha') {
        l.push(`*${T.trActualiza(e.n, cuando, e.de, typeof e.dossier === 'string' ? e.version : null)}*`, '');
      } else if (e.tipo === 'tablero') {
        const txt = e.accion === 'nuevo'
          ? T.tableroCrea(e.de, V(e.item?.tipo), `${{ tarea: 'T', reserva: 'R', decision: 'D' }[e.item?.tipo] || ''}${e.n}`, e.item?.titulo)
          : T.tableroCambia(e.de, e.id, Object.entries(e.cambios || {}).map(([k, v]) => `${T.campo(k)} → ${k === 'estado' ? V(v) : v}`).join('; '));
        l.push(`*#${e.n} · ${cuando} — ${txt}*`, '');
      } else if (e.tipo === 'numero') {
        l.push(`*#${e.n} · ${cuando} — ${T.numeroEv(e.de, (e.etiquetas || []).join(', '), e.serie, e.motivo)}*`, '');
      } else if (e.tipo === 'resuelto') {
        l.push(`*#${e.n} · ${cuando} — ${T.resueltoEv(e.de, e.ref)}*`, '');
      } else if (e.tipo === 'sala') {
        const accion = e.accion === 'permanente' ? (e.valor ? 'permanente' : 'temporal') : e.accion;
        l.push(`*${T.trSala(e.n, cuando, `${V(accion)}${e.accion === 'ampliada' ? ` +${e.cantidad}` : ''}`, e.de)}*`, '');
        if (e.resumen) l.push(`**${T.trResumenCierre()}:**`, '', e.resumen, '');
      }
    }
    if (this.formatearTablero) l.push(`## ${T.trTableroFinal()}`, '', '```', this.formatearTablero(st, { todo: true }), '```', '');
    return l.join('\n');
  }
}
