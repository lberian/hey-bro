// Herramientas MCP de hey Bro!: definiciones (JSON Schema, en español o inglés) y su lógica.
// Internamente todo es canónico (español); la capa de idioma traduce nombres y textos.

import {
  ALIAS_MODERADOR, ALIAS_TODOS, CAMPOS_FICHA, CAMPOS_FICHA_OBLIGATORIOS, CLASES_MENSAJE, ESTADOS_CERRADOS, ESTADOS_ITEM, ErrorBro, PREFIJO_ITEM,
  RESERVA_MIN_POR_DEFECTO, primeraLinea, slug,
} from './almacen.js';
import { diferenciaLineas } from './diferencias.js';
import { NOMBRE_EN, NOMBRE_ES, VALOR_EN, VALOR_ES, normalizarArgs, normalizarEnum } from './i18n.js';
import { MODOS } from './reservas.js';

const MAX_TEXTO = 100_000;
const MAX_DOSSIER = 150_000;
const MAX_SALIDA = 60_000;
const ESPERA_POR_DEFECTO = 45;
const ESPERA_MAXIMA = 50; // Claude Desktop corta las llamadas a herramientas locales hacia los 60 s
const PARADO_MIN = 15;

const p2 = (x) => String(x).padStart(2, '0');
export function hora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  const hh = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? hh : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${hh}`;
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearHerramientas(ctx) {
  const { almacen, T, idioma } = ctx;
  const en = idioma === 'en';
  const H = (n) => (en ? NOMBRE_EN[n] : n); // nombre de herramienta en el idioma activo
  const V = (v) => (en ? (VALOR_EN[v] || v) : (VALOR_ES[v] || String(v).replace(/_/g, ' '))); // valor mostrado

  // ───────────────────────────── formato ─────────────────────────────

  function hace(iso, ahora = Date.now()) {
    if (!iso) return T.nunca();
    const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000));
    if (s < 60) return T.haceS(s);
    if (s < 3600) return T.haceMin(Math.round(s / 60));
    if (s < 86400) return T.haceH(Math.round(s / 3600));
    return T.haceD(Math.round(s / 86400));
  }

  function textoPresencia(pres) {
    if (!pres || pres.estado === 'inactivo') return pres?.ultimo_visto ? T.inactivoVisto(hace(pres.ultimo_visto)) : T.inactivo();
    if (pres.estado === 'escuchando') return T.escuchandoAhora();
    return T.activoHace(hace(pres.ultimo_visto));
  }

  function recortar(texto, max) {
    const t = String(texto ?? '');
    return t.length > max ? `${t.slice(0, max)}\n${T.recortado(t.length - max, H('bro_contexto'))}` : t;
  }

  function formatearFicha(sala, p, { dossier = 'completo', maxDossier = 30_000 } = {}) {
    const pres = almacen.presenciaDe(sala, p.nombre);
    const l = [`■ ${p.nombre} — ${p.ficha.tipo_sesion || T.sesion()} — ${T.presencia()}: ${textoPresencia(pres)}`];
    for (const k of CAMPOS_FICHA) {
      if (k === 'tipo_sesion' || !p.ficha[k]) continue;
      l.push(`  ${T.campo(k)}: ${p.ficha[k]}`);
    }
    if (dossier !== 'no') {
      const d = p.dossier || { texto: '', version: 1, t: p.unido_t };
      l.push(`  ── ${T.dossierDe(p.nombre)} (v${d.version}, ${hora(d.t)}) ──`);
      l.push(d.texto ? recortar(d.texto, dossier === 'completo' ? MAX_DOSSIER : maxDossier) : T.vacio());
      l.push(`  ── ${T.finDossierDe(p.nombre)} ──`);
    }
    return l.join('\n');
  }

  function formatearItem(it, ev) {
    const estado = it.tipo === 'reserva' ? (ev.get(it.id)?.estado || it.estado) : it.estado;
    const extra = [];
    if (it.tipo === 'tarea') extra.push(`${T.responsable()}: ${it.responsable}`);
    else if (it.tipo === 'decision') extra.push(`${T.propuestaPor()}: ${it.creado_por || it.responsable}`);
    else {
      extra.push(`${T.de()}: ${it.responsable}`);
      extra.push(V(it.modo || 'exclusiva'));
      const r = ev.get(it.id);
      if (estado === 'activa' && r) extra.push(T.caduca(hora(new Date(r.fin).toISOString())));
      if (estado === 'en_cola' && r) extra.push(T.enCola(r.posicion, r.delante.join(', '), hora(new Date(r.inicio).toISOString())));
    }
    if (it.depende_de?.length) extra.push(`${T.dependeDe()}: ${it.depende_de.join(', ')}`);
    if (it.notas) extra.push(`${T.notas()}: ${it.notas}`);
    return `- ${it.id} [${V(estado)}] ${it.titulo} — ${extra.join(' · ')}`;
  }

  function formatearTablero(st, { todo = false } = {}) {
    const ev = almacen.reservasEvaluadas(st);
    const items = [...st.tablero.values()];
    const cerrado = (it) => ESTADOS_CERRADOS.includes(it.tipo === 'reserva' ? (ev.get(it.id)?.estado || it.estado) : it.estado);
    const l = [];
    let ocultos = 0;
    for (const [tipo, titulo] of [['tarea', T.tareas()], ['reserva', T.reservas()], ['decision', T.decisiones()]]) {
      const lista = items.filter((i) => i.tipo === tipo);
      const vis = todo ? lista : lista.filter((i) => !cerrado(i));
      ocultos += lista.length - vis.length;
      if (!vis.length) continue;
      l.push(titulo);
      for (const it of vis) l.push(formatearItem(it, ev));
    }
    if (!l.length) l.push(T.tableroVacio());
    if (ocultos) l.push(T.ocultosCerrados(ocultos, H('bro_tablero')));
    return l.join('\n');
  }

  function cabecera(st, yo) {
    const visible = almacen.estadoVisible(st);
    const partes = [T.salaCab(st.meta.id), V(visible), st.permanente ? T.permanente() : T.mensajesCuenta(st.mensajes, st.limite)];
    if (yo) partes.push(`${T.tu()}: ${yo}`);
    const gente = [...st.participantes.values()].map((p) => (yo && slug(p.nombre) === slug(yo)
      ? `${p.nombre} (${T.tu()})`
      : `${p.nombre} (${textoPresencia(almacen.presenciaDe(st.meta.id, p.nombre))})`));
    return `${partes.join(' · ')}\n${T.participantes()}: ${gente.join(', ') || T.nadieTodavia()}`;
  }

  // Avisos para fomentar la autonomía: tareas propias, turnos de reserva, encargos parados
  // y preguntas al moderador cuyo plazo venció (se sigue con la opción por defecto).
  function avisosAutonomia(st, yo, ev) {
    if (!yo) return [];
    const l = [];
    const ys = slug(yo);
    const mias = [...st.tablero.values()].filter((it) => it.tipo === 'tarea' && slug(it.responsable) === ys
      && ['pendiente', 'en_curso', 'bloqueada'].includes(it.estado));
    if (mias.length) l.push(T.tusTareas(mias.map((it) => `${it.id} ${T.cita(it.titulo)} (${V(it.estado)})`).join('; ')));
    const misRes = [...st.tablero.values()].filter((it) => it.tipo === 'reserva' && slug(it.responsable) === ys);
    const enCola = misRes.filter((it) => ev.get(it.id)?.estado === 'en_cola');
    if (enCola.length) l.push(T.tusReservasEnCola(enCola.map((it) => `${it.id} (${ev.get(it.id).posicion}.º)`).join(', ')));
    const limite = Date.now() - PARADO_MIN * 60_000;
    const parados = [...st.tablero.values()].filter((it) => it.tipo === 'tarea' && it.encargo_n
      && slug(it.creado_por) === ys && ['pendiente', 'en_curso'].includes(it.estado) && Date.parse(it.actualizado_t) < limite)
      .filter((it) => {
        const visto = almacen.presenciaDe(st.meta.id, it.responsable).ultimo_visto;
        return !visto || Date.parse(visto) < limite;
      });
    if (parados.length) {
      l.push(T.encargosParados(parados.map((it) => `${it.id} (${it.responsable}, ${V(it.estado)}, ${hace(almacen.presenciaDe(st.meta.id, it.responsable).ultimo_visto)})`).join('; ')));
    }
    for (const q of almacen.pendientesModerador(st)) {
      if (q.estado === 'vencida' && slug(q.de) === ys) l.push(T.plazoVencido(q.n, almacen.moderador, q.por_defecto, H('bro_enviar')));
    }
    return l;
  }

  function formatearEntrada(e, st, { yo = null, fichasCompletas = true } = {}) {
    const cuando = hora(e.t);
    switch (e.tipo) {
      case 'sala': {
        const quien = e.de ? T.por(e.de) : '';
        const t = {
          creada: T.salaCreadaEv(quien),
          pausada: T.salaPausadaEv(quien),
          reanudada: T.salaReanudadaEv(quien),
          cerrada: T.salaCerradaEv(quien, e.resumen),
          reabierta: T.salaReabiertaEv(quien),
          ampliada: T.salaAmpliadaEv(e.cantidad, quien),
          permanente: e.valor ? T.salaPermanenteEv(quien) : T.salaTemporalEv(quien),
        }[e.accion] || `${e.accion}`;
        return `[#${e.n} · ${cuando}] ${t}`;
      }
      case 'union': {
        if (!fichasCompletas) return `[#${e.n} · ${cuando}] ${T.seUneCorto(e.de, e.ficha?.tipo_sesion || T.sesion(), e.ficha?.papel || '?')}`;
        const l = [`[#${e.n} · ${cuando}] ${T.seUneLargo(e.de)}`];
        for (const k of CAMPOS_FICHA) if (e.ficha?.[k]) l.push(`  ${T.campo(k)}: ${e.ficha[k]}`);
        l.push(`  ── ${T.dossierDe(e.de)} (v1) ──`);
        l.push(e.dossier || T.vacio());
        l.push(`  ── ${T.finDossierDe(e.de)} ──`);
        return l.join('\n');
      }
      case 'ficha': {
        const l = [`[#${e.n} · ${cuando}] ${T.actualizaFicha(e.de, typeof e.dossier === 'string' ? e.version : null)}`];
        for (const [k, v] of Object.entries(e.cambios || {})) l.push(`  ${T.campo(k)}: ${v}`);
        if (e.resumen) l.push(`  ${T.resumenCambios()}: ${e.resumen}`);
        if (typeof e.dossier === 'string' && fichasCompletas) {
          if (e.anadido) { l.push(`  ${T.anadidoDossier()}:`); l.push(e.anadido); }
          else if (Array.isArray(e.diff) && e.diff.length) { l.push(`  ${T.cambiosDossier(!!e.diff_recortado)}:`); l.push(e.diff.join('\n')); }
          else if (e.diff === null) { l.push(`  ${T.dossierReescrito()}:`); l.push(recortar(e.dossier, 30_000)); }
        }
        return l.join('\n');
      }
      case 'mensaje': {
        if (e.clase === 'bitacora') return `[#${e.n} · ${cuando} · ${T.bitacoraDe(e.de)}] ${e.texto}`;
        const para = e.para?.length ? ` → ${e.para.join(', ')}` : ` → ${T.todos()}`;
        const extra = [];
        if (e.clase === 'encargo') extra.push(T.creaTarea(`T${e.n}`));
        if (e.tarea?.id) extra.push(`${e.tarea.id} → ${V(e.tarea.estado)}`);
        const l = [`[#${e.n} · ${cuando} · ${e.de}${para} · ${V(e.clase)}${extra.length ? ` · ${extra.join(' · ')}` : ''}]`];
        if (e.titulo) l.push(`${T.titulo()}: ${e.titulo}`);
        if (e.origen) l.push(T.peticionOriginal(e.origen));
        l.push(e.texto);
        if (e.por_defecto || e.plazo_min) l.push(T.porDefectoLinea(e.por_defecto, e.plazo_min ? hora(new Date(Date.parse(e.t) + e.plazo_min * 60_000).toISOString()) : null));
        if (yo && e.para?.some((x) => slug(x) === slug(yo)) && ['pregunta', 'peticion', 'encargo'].includes(e.clase)) {
          l.push(e.clase === 'encargo' ? T.encargoParaTi(`T${e.n}`, H('bro_tablero')) : T.dirigidoATi());
        }
        return l.join('\n');
      }
      case 'moderador': {
        const para = e.para?.length ? ` → ${e.para.join(', ')}` : ` → ${T.todos()}`;
        const resp = Array.isArray(e.resuelve) && e.resuelve.length ? ` · ${T.respondeA(e.resuelve.map((x) => `#${x}`).join(', '))}` : '';
        return `[#${e.n} · ${cuando} · ${T.moderadorHumano(e.de)}${para}${resp}]\n${e.texto}`;
      }
      case 'resuelto':
        return `[#${e.n} · ${cuando}] ${T.resueltoEv(e.de, e.ref)}`;
      case 'numero':
        return `[#${e.n} · ${cuando}] ${T.numeroEv(e.de, e.etiquetas.join(', '), e.serie, e.motivo)}`;
      case 'tablero': {
        if (e.accion === 'nuevo') {
          const it = e.item || {};
          const id = `${PREFIJO_ITEM[it.tipo] || 'X'}${e.n}`;
          const actual = st?.tablero?.get(id);
          const resp = it.tipo === 'tarea' ? T.responsableEntre(it.responsable || e.de) : '';
          const modo = it.tipo === 'reserva' ? ` (${V(it.modo || 'exclusiva')})` : '';
          const rech = actual?.estado === 'rechazada' ? ` → ${T.rechazadaMayus()}: ${actual.notas}` : '';
          const dep = it.depende_de?.length ? ` · ${T.dependeDe()} ${it.depende_de.join(', ')}` : '';
          return `[#${e.n} · ${cuando}] ${T.tableroCrea(e.de, V(it.tipo), id, it.titulo)}${modo}${resp}${dep}${it.notas ? ` · ${it.notas}` : ''}${rech}`;
        }
        const cambios = Object.entries(e.cambios || {}).map(([k, v]) => `${T.campo(k)} → ${Array.isArray(v) ? v.join(', ') : (k === 'estado' ? V(v) : v)}`).join('; ');
        return `[#${e.n} · ${cuando}] ${T.tableroCambia(e.de, e.id, cambios)}`;
      }
      default:
        return `[#${e.n} · ${cuando}] (${e.tipo})`;
    }
  }

  // ¿Esta entrada despierta a «yo» cuando espera?
  function despierta(e, ys, st) {
    if (e.de && slug(e.de) === ys) return false;
    const paraMi = (para) => !para || para.some((x) => slug(x) === ys);
    switch (e.tipo) {
      case 'mensaje': return e.clase !== 'bitacora' && paraMi(e.para);
      case 'moderador': return paraMi(e.para);
      case 'sala': return ['cerrada', 'reanudada', 'reabierta', 'ampliada'].includes(e.accion);
      case 'tablero': {
        const tipo = e.accion === 'nuevo' ? e.item?.tipo : st.tablero.get(e.id)?.tipo;
        if (tipo === 'decision') return true;
        const id = e.accion === 'nuevo' ? `${PREFIJO_ITEM[e.item?.tipo] || 'X'}${e.n}` : e.id;
        const it = st.tablero.get(id);
        return !!it && it.tipo === 'tarea' && (slug(it.responsable) === ys || slug(it.creado_por) === ys);
      }
      default: return false;
    }
  }

  function formatearLote(entradas, st, { yo, maxChars = MAX_SALIDA, fichasCompletas = true, filtro = null }) {
    const trozos = [];
    let usados = 0;
    let hasta = null;
    let entregadas = 0;
    for (const e of entradas) {
      if (filtro && !filtro(e)) { hasta = e.n; continue; }
      const t = formatearEntrada(e, st, { yo, fichasCompletas });
      if (usados + t.length > maxChars && entregadas > 0) break;
      trozos.push(t);
      usados += t.length + 2;
      hasta = e.n;
      entregadas += 1;
    }
    const restantes = entradas.filter((e) => e.n > (hasta ?? 0) && (!filtro || filtro(e))).length;
    return { texto: trozos.join('\n\n'), hasta, entregadas, restantes };
  }

  // ───────────────────────────── validación ─────────────────────────────

  function texto(args, campo, { obligatorio = false, max = 2000, min = 0 } = {}) {
    const v = args?.[campo];
    const nombre = campoEn(campo);
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
      if (obligatorio) throw new ErrorBro(T.falta(nombre));
      return '';
    }
    if (typeof v !== 'string') throw new ErrorBro(T.debeSerTexto(nombre));
    const t = v.trim();
    if (t.length > max) throw new ErrorBro(T.demasiadoLargo(nombre, t.length, max));
    if (t.length < min) throw new ErrorBro(T.demasiadoCorto(nombre, min));
    return t;
  }

  function entero(args, campo, { def, min, max }) {
    const v = args?.[campo];
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ErrorBro(T.debeSerNumero(campoEn(campo)));
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function campoEn(campo) {
    return en ? ({
      sala: 'room', yo: 'me', tema: 'topic', texto: 'text', resumen: 'summary', dossier: 'dossier', titulo: 'title',
      serie: 'series', objetivo: 'goal', nombre: 'name', origen: 'origin', motivo: 'reason', notas: 'notes',
      por_defecto: 'default', segundos: 'seconds', esperar_segundos: 'wait_seconds', limite_mensajes: 'message_limit',
      anadir_al_dossier: 'append_to_dossier', resumen_cambios: 'change_summary', papel_invitado: 'guest_role',
      cantidad: 'count', empezar_en: 'start_at', prefijo: 'prefix', plazo_min: 'deadline_min', caduca_min: 'expires_min',
      desde: 'since', ultimos: 'last', bitacora: 'log_entries',
    }[campo] || campo) : campo;
  }

  function validarNombre(yo) {
    const nombre = texto({ yo }, 'yo', { obligatorio: true, max: 40 });
    if (!slug(nombre)) throw new ErrorBro(T.nombreSinLetras());
    if (almacen.esModerador(nombre) || ALIAS_MODERADOR.test(nombre)) throw new ErrorBro(T.nombreReservado(nombre));
    if (ALIAS_TODOS.test(nombre)) throw new ErrorBro(T.nombreReservadoTodos(nombre));
    return nombre;
  }

  function validarFicha(ficha, { parcial = false } = {}) {
    if (ficha === undefined || ficha === null) {
      if (parcial) return {};
      throw new ErrorBro(T.faltaFicha(CAMPOS_FICHA_OBLIGATORIOS.map((k) => T.campoParam(k)).join(', ')));
    }
    if (typeof ficha !== 'object' || Array.isArray(ficha)) throw new ErrorBro(T.fichaObjeto());
    const limpia = {};
    for (const k of CAMPOS_FICHA) {
      if (ficha[k] === undefined || ficha[k] === null) continue;
      const v = typeof ficha[k] === 'string' ? ficha[k].trim() : Array.isArray(ficha[k]) ? ficha[k].join('; ') : String(ficha[k]);
      if (v.length > 4000) throw new ErrorBro(T.fichaCampoLargo(T.campoParam(k)));
      if (v) limpia[k] = v;
    }
    if (!parcial) {
      const faltan = CAMPOS_FICHA_OBLIGATORIOS.filter((k) => !limpia[k]);
      if (faltan.length) throw new ErrorBro(T.faltanCamposFicha(faltan.map((k) => T.campoParam(k)).join(', ')));
    }
    return limpia;
  }

  function exigirParticipante(st, yo) {
    const p = st.participantes.get(slug(yo));
    if (!p) {
      const nombres = [...st.participantes.values()].map((x) => x.nombre);
      throw new ErrorBro(T.noEstasEnSala(st.meta.id, yo, H('bro_unirse'), nombres));
    }
    return p;
  }

  function exigirAbierta(st, { permitirPausa = false } = {}) {
    if (st.estado === 'cerrada') throw new ErrorBro(T.salaCerradaErr(st.meta.id, st.cierre?.resumen));
    if (st.estado === 'pausada' && !permitirPausa) throw new ErrorBro(T.salaPausadaErr(H('bro_esperar')));
  }

  function enumValido(campo, valor, validos) {
    const c = normalizarEnum(campo, valor);
    if (!validos.includes(c)) throw new ErrorBro(T.valorNoValido(valor, validos.map(V).join(', ')));
    return c;
  }

  // ───────────────────────────── espera ─────────────────────────────

  async function recogerNovedades({ sala, yo, segundos, signal, progreso }) {
    const ys = slug(yo);
    const inicio = Date.now();
    const fin = inicio + segundos * 1000;
    let pres = almacen.leerPresencia(sala, yo) || { nombre: yo, cursor: 0 };
    pres.ultimo_visto = new Date().toISOString();
    pres.escuchando_hasta = segundos > 0 ? new Date(fin).toISOString() : null;
    almacen.guardarPresencia(sala, yo, pres);

    const st0 = almacen.estadoSala(sala);
    const ev0 = almacen.reservasEvaluadas(st0);
    const misEnCola = new Set([...st0.tablero.values()]
      .filter((it) => it.tipo === 'reserva' && slug(it.responsable) === ys && ev0.get(it.id)?.estado === 'en_cola').map((it) => it.id));

    let st;
    let todas;
    let activadas = [];
    let ultimoAviso = inicio;
    for (;;) {
      st = almacen.estadoSala(sala);
      todas = almacen.entradasDesde(sala, pres.cursor || 0);
      const ajenas = todas.filter((e) => !(e.de && slug(e.de) === ys));
      if (misEnCola.size) {
        const ev = almacen.reservasEvaluadas(st);
        activadas = [...misEnCola].filter((id) => ev.get(id)?.estado === 'activa');
        if (activadas.length) break;
      }
      if (ajenas.some((e) => despierta(e, ys, st))) break;
      if (st.estado === 'cerrada') break;
      if (Date.now() >= fin || signal?.aborted) break;
      if (progreso && Date.now() - ultimoAviso >= 10_000) {
        ultimoAviso = Date.now();
        progreso(Math.round((Date.now() - inicio) / 1000), segundos);
      }
      await dormir(600);
    }
    if (signal?.aborted) throw new ErrorBro(T.esperaCancelada());

    const lote = formatearLote(todas, st, { yo, filtro: (e) => !(e.de && slug(e.de) === ys) });
    pres = almacen.leerPresencia(sala, yo) || pres;
    const hastaFinal = lote.restantes > 0 ? (lote.hasta ?? pres.cursor ?? 0) : (todas.length ? todas[todas.length - 1].n : (pres.cursor ?? 0));
    pres.cursor = Math.max(pres.cursor || 0, hastaFinal);
    pres.escuchando_hasta = null;
    pres.ultimo_visto = new Date().toISOString();
    almacen.guardarPresencia(sala, yo, pres);
    return { st, lote, activadas, esperado: Math.round((Date.now() - inicio) / 1000) };
  }

  function textoNovedades({ st, lote, activadas, esperado }, { yo, segundos }) {
    const ev = almacen.reservasEvaluadas(st);
    const l = [cabecera(st, yo)];
    for (const id of activadas || []) l.push(T.teToca(id, st.tablero.get(id)?.titulo || ''));
    l.push(...avisosAutonomia(st, yo, ev));
    if (lote.entregadas) {
      l.push('', `── ${T.novedades()} ──`, lote.texto);
      if (lote.restantes) l.push('', T.quedanNovedades(lote.restantes, H('bro_esperar')));
    } else if (!activadas?.length) {
      l.push('', segundos > 0 ? T.sinNovedadesEn(esperado) : T.sinNovedades());
    }
    if (st.estado === 'cerrada') l.push('', T.cerradaDejaEscuchar());
    else if (st.estado === 'pausada') l.push('', T.pausadaNoEnvies());
    else if (!st.permanente && st.mensajes >= st.limite) l.push('', T.limiteAlcanzadoAviso(st.limite, H('bro_cerrar')));
    else if (!lote.entregadas && segundos > 0) {
      const otros = [...st.ultimaPor.entries()].filter(([k]) => k !== slug(yo)).map(([, t]) => Date.parse(t));
      const ultima = otros.length ? Math.max(...otros) : Date.parse(st.meta.creada);
      if (!st.permanente && Date.now() - ultima > almacen.inactividadMs) l.push('', T.avisoInactividad(hace(new Date(ultima).toISOString())));
      else l.push('', T.sigueEscuchando(H('bro_esperar')));
    }
    return l.join('\n');
  }

  function textoHuerfanas(excepto = null, max = 3) {
    const h = almacen.huerfanas().filter((x) => x.sala !== excepto).slice(0, max);
    if (!h.length) return '';
    return [T.esperanAyudaTitulo(), ...h.map((x) => T.esperanAyudaLinea(x.sala, x.de, hace(x.t), x.texto))].join('\n');
  }

  // ───────────────────────────── definiciones ─────────────────────────────

  const L = (es, eng) => (en ? eng : es);
  const P = (n) => (en ? ({
    sala: 'room', yo: 'me', tema: 'topic', objetivo: 'goal', nombre: 'name', limite_mensajes: 'message_limit',
    papel_invitado: 'guest_role', permanente: 'permanent', ficha: 'profile', dossier: 'dossier', retomar: 'resume',
    anadir_al_dossier: 'append_to_dossier', resumen_cambios: 'change_summary', sala_permanente: 'room_permanent',
    texto: 'text', clase: 'kind', para: 'to', titulo: 'title', origen: 'origin', tarea: 'task',
    esperar_segundos: 'wait_seconds', por_defecto: 'default', plazo_min: 'deadline_min', resuelve: 'resolves',
    segundos: 'seconds', nuevo: 'new', cambiar: 'change', todo: 'show_all', serie: 'series', motivo: 'reason',
    cantidad: 'count', empezar_en: 'start_at', prefijo: 'prefix', solo_ver: 'peek', de: 'who', bitacora: 'log_entries',
    desde: 'since', ultimos: 'last', incluir_bitacora: 'include_log', incluir_cerradas: 'include_closed',
    resumen: 'summary', abrir: 'open', tipo: 'type', responsable: 'owner', depende_de: 'depends_on', notas: 'notes',
    caduca_min: 'expires_min', modo: 'mode', esperar_turno: 'queue', estado: 'status', id: 'id',
    tipo_sesion: 'session_type', papel: 'role', mision: 'mission', capacidades: 'capabilities', limites: 'limits',
    necesito: 'needs', ofrezco: 'offers', disponibilidad: 'availability', id_sesion: 'session_id',
  }[n] || n) : n);
  const props = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [P(k), v]));
  const req = (...ks) => ks.map(P);
  const S = (desc) => ({ type: 'string', description: desc });
  const I = (desc) => ({ type: 'integer', description: desc });
  const B = (desc) => ({ type: 'boolean', description: desc });
  const ENUM = (lista, desc) => ({ type: 'string', enum: en ? lista.map((x) => VALOR_EN[x] || x) : lista, description: desc });

  const ESQUEMA_FICHA = {
    type: 'object',
    description: T.dFicha(),
    properties: props({
      tipo_sesion: S(T.dTipoSesion()), papel: S(T.dPapel()), mision: S(T.dMision()), capacidades: S(T.dCapacidades()),
      limites: S(T.dLimites()), necesito: S(T.dNecesito()), ofrezco: S(T.dOfrezco()), estado: S(T.dEstadoFicha()),
      disponibilidad: S(T.dDisponibilidad()), id_sesion: S(T.dIdSesion()),
    }),
  };

  const DEFINICIONES = [
    {
      name: H('bro_crear_sala'),
      description: T.dCrearSala(),
      inputSchema: {
        type: 'object',
        properties: props({
          tema: S(T.dTema()), objetivo: S(T.dObjetivo()), nombre: S(T.dNombreSala()), limite_mensajes: I(T.dLimite()),
          permanente: B(T.dPermanente()), papel_invitado: S(T.dPapelInvitado()), yo: S(T.dYoCrear()),
          ficha: ESQUEMA_FICHA, dossier: S(T.dDossier()),
        }),
        required: req('tema'),
      },
    },
    {
      name: H('bro_unirse'),
      description: T.dUnirse(),
      inputSchema: {
        type: 'object',
        properties: props({ sala: S(T.dSala()), yo: S(T.dYo()), ficha: ESQUEMA_FICHA, dossier: S(T.dDossier()), retomar: B(T.dRetomar()) }),
        required: req('sala', 'yo'),
      },
    },
    {
      name: H('bro_actualizar'),
      description: T.dActualizar(),
      inputSchema: {
        type: 'object',
        properties: props({
          sala: S(T.dSala()), yo: S(T.dYo()), ficha: { ...ESQUEMA_FICHA, description: T.dFichaParcial() },
          dossier: S(T.dDossierNuevo()), anadir_al_dossier: S(T.dAnadirDossier()), resumen_cambios: S(T.dResumenCambios()),
          sala_permanente: B(T.dSalaPermanente()),
        }),
        required: req('sala', 'yo'),
      },
    },
    {
      name: H('bro_enviar'),
      description: T.dEnviar(),
      inputSchema: {
        type: 'object',
        properties: props({
          sala: S(T.dSala()), yo: S(T.dYo()), texto: S(T.dTexto()), clase: ENUM(CLASES_MENSAJE, T.dClase()),
          para: S(T.dPara()), titulo: S(T.dTitulo()), origen: S(T.dOrigen()),
          tarea: { type: 'object', description: T.dTarea(), properties: props({ id: S('T12'), estado: S(T.dEstadoTarea()) }), required: req('id', 'estado') },
          por_defecto: S(T.dPorDefecto()), plazo_min: I(T.dPlazo()),
          resuelve: { type: 'array', items: { type: 'integer' }, description: T.dResuelve() },
          esperar_segundos: I(T.dEsperarSegundos(ESPERA_MAXIMA)),
        }),
        required: req('sala', 'yo', 'texto'),
      },
    },
    {
      name: H('bro_esperar'),
      description: T.dEsperar(ESPERA_MAXIMA, ESPERA_POR_DEFECTO),
      inputSchema: {
        type: 'object',
        properties: props({ sala: S(T.dSala()), yo: S(T.dYo()), segundos: I(T.dSegundos(ESPERA_MAXIMA, ESPERA_POR_DEFECTO)) }),
        required: req('sala', 'yo'),
      },
    },
    {
      name: H('bro_tablero'),
      description: T.dTablero(),
      inputSchema: {
        type: 'object',
        properties: props({
          sala: S(T.dSala()), yo: S(T.dYo()), todo: B(T.dTodo()),
          nuevo: {
            type: 'object',
            properties: props({
              tipo: ENUM(['tarea', 'reserva', 'decision'], T.dTipoItem()), titulo: S(T.dTituloItem()),
              responsable: S(T.dResponsable()), depende_de: { type: 'array', items: { type: 'string' }, description: T.dDependeDe() },
              notas: S(T.dNotas()), estado: S(T.dEstadoNuevo()), modo: ENUM(MODOS, T.dModo()), esperar_turno: B(T.dEsperarTurno()),
              caduca_min: I(T.dCaduca(RESERVA_MIN_POR_DEFECTO)),
            }),
            required: req('tipo', 'titulo'),
          },
          cambiar: {
            type: 'object',
            properties: props({
              id: S(T.dIdItem()), estado: S(T.dEstadoCambio()), responsable: S(T.dResponsable()), titulo: S(T.dTituloItem()),
              notas: S(T.dNotas()), depende_de: { type: 'array', items: { type: 'string' } },
            }),
            required: req('id'),
          },
        }),
        required: req('sala', 'yo'),
      },
    },
    {
      name: H('bro_numero'),
      description: T.dNumero(),
      inputSchema: {
        type: 'object',
        properties: props({
          serie: S(T.dSerie()), yo: S(T.dYo()), sala: S(T.dSalaNumero()), motivo: S(T.dMotivo()),
          cantidad: I(T.dCantidad()), empezar_en: I(T.dEmpezarEn()), prefijo: S(T.dPrefijo()), solo_ver: B(T.dSoloVer()),
        }),
        required: req('serie', 'yo'),
      },
    },
    {
      name: H('bro_contexto'),
      description: T.dContexto(),
      inputSchema: {
        type: 'object',
        properties: props({ sala: S(T.dSala()), de: S(T.dDe()), bitacora: I(T.dBitacora()) }),
        required: req('sala'),
      },
    },
    {
      name: H('bro_historial'),
      description: T.dHistorial(),
      inputSchema: {
        type: 'object',
        properties: props({ sala: S(T.dSala()), desde: I(T.dDesde()), ultimos: I(T.dUltimos()), incluir_bitacora: B(T.dIncluirBitacora()) }),
        required: req('sala'),
      },
    },
    {
      name: H('bro_salas'),
      description: T.dSalas(),
      inputSchema: { type: 'object', properties: props({ incluir_cerradas: B(T.dIncluirCerradas()) }) },
    },
    {
      name: H('bro_cerrar'),
      description: T.dCerrar(),
      inputSchema: {
        type: 'object',
        properties: props({ sala: S(T.dSala()), yo: S(T.dYo()), resumen: S(T.dResumen()) }),
        required: req('sala', 'yo', 'resumen'),
      },
    },
    {
      name: H('bro_visor'),
      description: T.dVisor(),
      inputSchema: { type: 'object', properties: props({ sala: S(T.dSalaVisor()), abrir: B(T.dAbrir()) }) },
    },
  ];

  // ───────────────────────────── lógica ─────────────────────────────

  function unirseInterno({ sala, yo, ficha, dossier, retomar }) {
    const st0 = almacen.estadoSala(sala);
    const existente = st0.participantes.get(slug(yo));
    let accion;
    if (existente) {
      if (!retomar) throw new ErrorBro(T.yaHayAlguien(existente.nombre, P('retomar')));
      const cambios = ficha ? validarFicha(ficha, { parcial: true }) : {};
      const entrada = { tipo: 'ficha', de: existente.nombre, cambios };
      if (dossier) {
        const d = texto({ dossier }, 'dossier', { max: MAX_DOSSIER });
        const dif = diferenciaLineas(existente.dossier?.texto || '', d);
        Object.assign(entrada, { dossier: d, version: (existente.dossier?.version || 1) + 1, diff: dif ? dif.lineas : null, diff_recortado: !!dif?.recortado });
      }
      if (Object.keys(cambios).length || entrada.dossier) almacen.anotar(sala, entrada);
      accion = 'retoma';
    } else {
      exigirAbierta(st0, { permitirPausa: true });
      const f = validarFicha(ficha);
      const d = texto({ dossier }, 'dossier', { obligatorio: true, max: MAX_DOSSIER, min: 40 });
      almacen.anotar(sala, { tipo: 'union', de: yo, ficha: f, dossier: d });
      almacen.guardarPresencia(sala, yo, { nombre: yo, cursor: 0, ultimo_visto: new Date().toISOString(), escuchando_hasta: null });
      accion = 'nuevo';
    }
    const nombre = existente ? existente.nombre : yo;
    const st = almacen.estadoSala(sala);
    const l = [cabecera(st, nombre)];
    l.push(`${T.temaL()}: ${st.meta.tema}${st.meta.objetivo ? `\n${T.objetivoComun()}: ${st.meta.objetivo}` : ''}`);
    const otros = [...st.participantes.values()].filter((p) => slug(p.nombre) !== slug(nombre));
    l.push('', `══ ${T.tusHermanosTitulo()} ══`);
    l.push(otros.length ? otros.map((p) => formatearFicha(sala, p, { dossier: 'resumido', maxDossier: 40_000 })).join('\n\n') : T.ningunHermanoAun());
    l.push('', `══ ${T.tableroTitulo()} ══`, formatearTablero(st));

    let pres = almacen.leerPresencia(sala, nombre) || { nombre, cursor: 0 };
    const previas = almacen.entradasDesde(sala, pres.cursor || 0);
    const lote = formatearLote(previas, st, {
      yo: nombre,
      maxChars: 40_000,
      filtro: (e) => !(e.de && slug(e.de) === slug(nombre)) && !['union', 'ficha'].includes(e.tipo) && !(e.tipo === 'sala' && e.accion === 'creada'),
    });
    if (lote.entregadas) {
      l.push('', `══ ${T.mensajesAnteriores()} ══`, lote.texto);
      if (lote.restantes) l.push(T.quedanMas(lote.restantes, H('bro_esperar')));
    }
    pres = almacen.leerPresencia(sala, nombre) || pres;
    const hastaFinal = lote.restantes > 0 ? (lote.hasta ?? pres.cursor ?? 0) : (previas.length ? previas[previas.length - 1].n : (pres.cursor || 0));
    pres.cursor = Math.max(pres.cursor || 0, hastaFinal);
    pres.ultimo_visto = new Date().toISOString();
    almacen.guardarPresencia(sala, nombre, pres);

    const huerf = textoHuerfanas(sala);
    if (huerf) l.push('', huerf);
    l.push('', accion === 'nuevo'
      ? (otros.length ? T.siguienteLecturaVuelta() : T.siguienteApertura(H('bro_esperar')))
      : T.hasRetomado(H('bro_esperar')));
    return l.join('\n');
  }

  async function manejar(nombre, args = {}, extra = {}) {
    switch (nombre) {
      case 'bro_crear_sala': {
        const tema = texto(args, 'tema', { obligatorio: true, max: 200 });
        const objetivo = texto(args, 'objetivo', { max: 1000 });
        const id = texto(args, 'nombre', { max: 40 });
        const papelInvitado = texto(args, 'papel_invitado', { max: 400 });
        const limite = entero(args, 'limite_mensajes', { def: almacen.limitePorDefecto, min: 4, max: 500 });
        let yo = null;
        if (args.yo) {
          yo = validarNombre(args.yo);
          validarFicha(args.ficha);
          texto(args, 'dossier', { obligatorio: true, max: MAX_DOSSIER, min: 40 });
        }
        const meta = almacen.crearSala({ tema, objetivo, nombre: id, limite, creador: yo, papelInvitado, permanente: !!args.permanente });
        const url = await ctx.visor?.asegurar().catch(() => null);
        const l = [T.salaCreada(meta.id), T.salaCreadaDetalle(tema, objetivo, meta.permanente ? null : limite)];
        if (yo) l.push('', unirseInterno({ sala: meta.id, yo, ficha: args.ficha, dossier: args.dossier, retomar: false }));
        l.push('', T.invitacionTitulo(), meta.invitacion);
        if (url) l.push('', T.visorEnDirecto(`${url}#${meta.id}`, H('bro_visor')));
        return l.join('\n');
      }

      case 'bro_unirse': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        return unirseInterno({ sala, yo: validarNombre(args.yo), ficha: args.ficha, dossier: args.dossier, retomar: !!args.retomar });
      }

      case 'bro_actualizar': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const yo = validarNombre(args.yo);
        const st = almacen.estadoSala(sala);
        const p = exigirParticipante(st, yo);
        exigirAbierta(st, { permitirPausa: true });
        const cambios = validarFicha(args.ficha, { parcial: true });
        const nuevo = texto(args, 'dossier', { max: MAX_DOSSIER });
        const anadido = texto(args, 'anadir_al_dossier', { max: MAX_DOSSIER });
        const resumen = texto(args, 'resumen_cambios', { max: 500 });
        const cambiaSala = typeof args.sala_permanente === 'boolean' && args.sala_permanente !== st.permanente;
        if (!Object.keys(cambios).length && !nuevo && !anadido && !cambiaSala) throw new ErrorBro(T.nadaQueActualizar());
        const l = [];
        if (cambiaSala) {
          almacen.anotar(sala, { tipo: 'sala', accion: 'permanente', valor: args.sala_permanente, de: p.nombre });
          l.push(args.sala_permanente ? T.salaAhoraPermanente() : T.salaAhoraTemporal());
        }
        if (Object.keys(cambios).length || nuevo || anadido) {
          const entrada = { tipo: 'ficha', de: p.nombre, cambios };
          if (resumen) entrada.resumen = resumen;
          const anterior = p.dossier?.texto || '';
          if (nuevo || anadido) {
            const base = nuevo || anterior;
            const final = anadido ? `${base}${base ? '\n\n' : ''}${anadido}` : base;
            if (final.length > MAX_DOSSIER) throw new ErrorBro(T.dossierExcede(MAX_DOSSIER));
            entrada.dossier = final;
            entrada.version = (p.dossier?.version || 1) + 1;
            if (anadido && !nuevo) entrada.anadido = anadido;
            else {
              const dif = diferenciaLineas(anterior, final);
              entrada.diff = dif ? dif.lineas : null;
              entrada.diff_recortado = !!dif?.recortado;
            }
          }
          const e = almacen.anotar(sala, entrada);
          const p2x = almacen.estadoSala(sala).participantes.get(slug(yo));
          l.push(T.actualizado(e.n, entrada.dossier ? p2x.dossier.version : null, entrada.dossier ? p2x.dossier.texto.length : null));
        }
        return l.join('\n');
      }

      case 'bro_enviar': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const yo = validarNombre(args.yo);
        const st = almacen.estadoSala(sala);
        const p = exigirParticipante(st, yo);
        const clase = args.clase ? enumValido('clase', args.clase, CLASES_MENSAJE) : 'mensaje';
        exigirAbierta(st, { permitirPausa: clase === 'bitacora' });
        const cuerpo = texto(args, 'texto', { obligatorio: true, max: MAX_TEXTO });
        if (clase !== 'bitacora' && !st.permanente && st.mensajes >= st.limite) throw new ErrorBro(T.limiteAlcanzadoErr(st.limite, H('bro_cerrar')));
        const suyas = almacen.entradasDesde(sala, 0).filter((x) => x.tipo === 'mensaje' && slug(x.de) === slug(p.nombre));
        const ultima = suyas[suyas.length - 1];
        if (ultima && ultima.texto === cuerpo && ultima.clase === clase && Date.now() - Date.parse(ultima.t) < 120_000) {
          throw new ErrorBro(T.mensajeRepetido(ultima.n, hace(ultima.t), H('bro_esperar')));
        }
        const para = almacen.normalizarPara(st, args.para);
        if (clase === 'encargo') {
          if (!para || para.length !== 1) throw new ErrorBro(T.encargoUnaSesion(P('para')));
          if (almacen.esModerador(para[0])) throw new ErrorBro(T.encargoNoModerador());
          if (slug(para[0]) === slug(yo)) throw new ErrorBro(T.encargoATiMismo());
        }
        const entrada = { tipo: 'mensaje', de: p.nombre, clase, texto: cuerpo, para };
        const titulo = texto(args, 'titulo', { max: 160 });
        if (titulo) entrada.titulo = titulo;
        const origen = texto(args, 'origen', { max: 8000 });
        if (origen) entrada.origen = origen;
        const porDefecto = texto(args, 'por_defecto', { max: 2000 });
        if (porDefecto) entrada.por_defecto = porDefecto;
        const plazo = entero(args, 'plazo_min', { def: null, min: 1, max: 10_080 });
        if (plazo) entrada.plazo_min = plazo;
        if (args.tarea) {
          const id = String(args.tarea.id || '').trim().toUpperCase();
          const it = st.tablero.get(id);
          if (!it) throw new ErrorBro(T.noExisteItem(id));
          entrada.tarea = { id, estado: enumValido('estado', args.tarea.estado, ESTADOS_ITEM[it.tipo]) };
        }
        if (args.resuelve !== undefined) {
          const refs = (Array.isArray(args.resuelve) ? args.resuelve : [args.resuelve]).map(Number).filter(Number.isFinite);
          for (const r of refs) {
            const q = st.paraModerador.find((x) => x.n === r);
            if (!q || slug(q.de) !== slug(p.nombre)) throw new ErrorBro(T.resuelveInvalido(r));
          }
          if (refs.length) entrada.resuelve = refs;
        }
        const e = almacen.anotar(sala, entrada);
        const st2 = almacen.estadoSala(sala);
        const l = [T.enviado(e.n, V(clase), para ? para.join(', ') : T.todos(), st2.permanente ? null : `${st2.mensajes}/${st2.limite}`)];
        if (clase === 'encargo') {
          const dest = st2.participantes.get(slug(para[0]));
          l.push(T.tareaCreada(`T${e.n}`, para[0], dest?.ficha?.disponibilidad || T.noIndicada(), textoPresencia(almacen.presenciaDe(sala, para[0]))));
          if (dest?.ficha?.id_sesion) l.push(T.avisoNativo(dest.ficha.id_sesion));
        }
        if (entrada.tarea) l.push(`${entrada.tarea.id} → ${V(entrada.tarea.estado)}.`);
        if (entrada.resuelve) l.push(T.marcadasResueltas(entrada.resuelve.map((x) => `#${x}`).join(', ')));
        if (para?.some((x) => almacen.esModerador(x)) && ['pregunta', 'peticion'].includes(clase) && !porDefecto) {
          l.push(T.consejoPorDefecto(P('por_defecto'), P('plazo_min')));
        }
        const espera = entero(args, 'esperar_segundos', { def: 0, min: 0, max: ESPERA_MAXIMA });
        if (espera > 0) {
          const r = await recogerNovedades({ sala, yo: p.nombre, segundos: espera, signal: extra.signal, progreso: extra.progreso });
          l.push('', textoNovedades(r, { yo: p.nombre, segundos: espera }));
        }
        return l.join('\n');
      }

      case 'bro_esperar': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const yo = validarNombre(args.yo);
        const p = exigirParticipante(almacen.estadoSala(sala), yo);
        const segundos = entero(args, 'segundos', { def: ESPERA_POR_DEFECTO, min: 0, max: ESPERA_MAXIMA });
        const r = await recogerNovedades({ sala, yo: p.nombre, segundos, signal: extra.signal, progreso: extra.progreso });
        return textoNovedades(r, { yo: p.nombre, segundos });
      }

      case 'bro_tablero': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const yo = validarNombre(args.yo);
        const st = almacen.estadoSala(sala);
        const p = exigirParticipante(st, yo);
        const notas = [];
        if (args.nuevo || args.cambiar) exigirAbierta(st, { permitirPausa: true });
        if (args.nuevo) {
          const n = args.nuevo;
          const tipo = enumValido('tipo', n.tipo, ['tarea', 'reserva', 'decision']);
          const item = { tipo, titulo: texto(n, 'titulo', { obligatorio: true, max: 400 }) };
          if (tipo === 'tarea') {
            const resp = n.responsable ? almacen.normalizarPara(st, n.responsable, { permitirModerador: false }) : null;
            if (resp && resp.length !== 1) throw new ErrorBro(T.unicoResponsable());
            item.responsable = resp ? resp[0] : p.nombre;
          }
          if (Array.isArray(n.depende_de) && n.depende_de.length) {
            item.depende_de = n.depende_de.map((x) => String(x).trim().toUpperCase());
            const faltan = item.depende_de.filter((x) => !st.tablero.has(x));
            if (faltan.length) throw new ErrorBro(T.noExistenEnTablero(faltan.join(', ')));
          }
          const nt = texto(n, 'notas', { max: 2000 });
          if (nt) item.notas = nt;
          if (n.estado !== undefined && tipo !== 'reserva') item.estado = enumValido('estado', n.estado, ESTADOS_ITEM[tipo]);
          if (tipo === 'reserva') {
            item.duracion_min = entero(n, 'caduca_min', { def: RESERVA_MIN_POR_DEFECTO, min: 5, max: 1440 });
            item.modo = n.modo ? enumValido('modo', n.modo, MODOS) : 'exclusiva';
            item.esperar_turno = n.esperar_turno !== false;
          }
          const e = almacen.anotar(sala, { tipo: 'tablero', accion: 'nuevo', de: p.nombre, item });
          const st2 = almacen.estadoSala(sala);
          const creado = st2.tablero.get(`${PREFIJO_ITEM[tipo]}${e.n}`);
          if (creado?.estado === 'rechazada') notas.push(T.reservaRechazada(creado.id, creado.notas, P('esperar_turno')));
          else if (tipo === 'reserva') {
            const r = almacen.reservasEvaluadas(st2).get(creado.id);
            if (r?.estado === 'en_cola') notas.push(T.reservaEnCola(creado.id, r.posicion, r.delante.join(', '), hora(new Date(r.inicio).toISOString()), H('bro_esperar')));
            else notas.push(T.reservaActiva(creado.id, hora(new Date(r.fin).toISOString())));
          } else notas.push(T.creado(creado.id));
        }
        if (args.cambiar) {
          const c = args.cambiar;
          const id = String(c.id || '').trim().toUpperCase();
          const st1 = almacen.estadoSala(sala);
          const it = st1.tablero.get(id);
          if (!it) throw new ErrorBro(T.noExisteItem(id));
          const cambios = {};
          if (c.estado !== undefined) cambios.estado = enumValido('estado', c.estado, ESTADOS_ITEM[it.tipo]);
          if (it.tipo === 'reserva' && slug(it.responsable) !== slug(p.nombre)) throw new ErrorBro(T.reservaAjena(id, it.responsable));
          if (c.responsable !== undefined && it.tipo === 'tarea') {
            const r = almacen.normalizarPara(st1, c.responsable, { permitirModerador: false });
            if (!r || r.length !== 1) throw new ErrorBro(T.unicoResponsable());
            cambios.responsable = r[0];
          }
          if (c.titulo !== undefined && it.tipo !== 'reserva') cambios.titulo = texto(c, 'titulo', { obligatorio: true, max: 400 });
          if (c.notas !== undefined) cambios.notas = texto(c, 'notas', { max: 2000 });
          if (Array.isArray(c.depende_de)) cambios.depende_de = c.depende_de.map((x) => String(x).trim().toUpperCase());
          if (!Object.keys(cambios).length) throw new ErrorBro(T.nadaQueCambiar());
          almacen.anotar(sala, { tipo: 'tablero', accion: 'cambio', de: p.nombre, id, cambios });
          notas.push(T.itemActualizado(id));
        }
        const st3 = almacen.estadoSala(sala);
        return `${notas.length ? `${notas.join(' ')}\n\n` : ''}══ ${T.tableroDe(sala)} ══\n${formatearTablero(st3, { todo: !!args.todo })}`;
      }

      case 'bro_numero': {
        const serie = texto(args, 'serie', { obligatorio: true, max: 60 });
        const yo = validarNombre(args.yo);
        const motivo = texto(args, 'motivo', { max: 300 });
        const prefijo = texto(args, 'prefijo', { max: 10 });
        if (args.solo_ver) {
          const v = almacen.verSerie(serie, 10);
          if (!v.meta) return T.serieNoExiste(serie);
          const lineas = v.registros.map((r) => `- ${r.etiqueta} · ${r.de || '?'}${r.sala ? ` · ${r.sala}` : ''} · ${hora(r.t)}${r.motivo ? ` · ${r.motivo}` : ''}`);
          return [T.serieResumen(v.meta.serie, v.siguiente), ...lineas].join('\n');
        }
        let sala = null;
        if (args.sala) {
          sala = texto(args, 'sala', { max: 60 });
          almacen.exigirSala(sala);
          exigirParticipante(almacen.estadoSala(sala), yo);
        }
        const cantidad = entero(args, 'cantidad', { def: 1, min: 1, max: 50 });
        const empezarEn = entero(args, 'empezar_en', { def: null, min: 0, max: 1e9 });
        const { meta, tomados } = almacen.tomarNumeros({ serie, de: yo, sala, motivo, cantidad, empezarEn, prefijo: prefijo || null });
        const etiquetas = tomados.map((r) => r.etiqueta);
        if (sala) almacen.anotar(sala, { tipo: 'numero', de: yo, serie: meta.serie, etiquetas, motivo });
        return T.numerosTomados(etiquetas.join(', '), meta.serie, `${meta.prefijo || ''}${tomados[tomados.length - 1].n + 1}`);
      }

      case 'bro_contexto': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const st = almacen.estadoSala(sala);
        const ev = almacen.reservasEvaluadas(st);
        const nBit = entero(args, 'bitacora', { def: 15, min: 0, max: 200 });
        let lista = [...st.participantes.values()];
        if (args.de) {
          const p = st.participantes.get(slug(args.de));
          if (!p) throw new ErrorBro(T.nadieLlamado(args.de, lista.map((x) => x.nombre)));
          lista = [p];
        }
        if (!lista.length) return T.nadieEnSala();
        const todas = almacen.entradasDesde(sala, 0);
        const bloques = lista.map((p) => {
          const l = [formatearFicha(sala, p, { dossier: lista.length === 1 ? 'completo' : 'resumido', maxDossier: 25_000 })];
          const suyas = [...st.tablero.values()].filter((it) => slug(it.responsable) === slug(p.nombre)
            && !ESTADOS_CERRADOS.includes(it.tipo === 'reserva' ? (ev.get(it.id)?.estado || it.estado) : it.estado));
          if (suyas.length) l.push(`  ${T.susElementos()}:`, ...suyas.map((it) => `  ${formatearItem(it, ev)}`));
          const bit = todas.filter((e) => e.tipo === 'mensaje' && e.clase === 'bitacora' && slug(e.de) === slug(p.nombre)).slice(-nBit);
          if (bit.length) l.push(`  ${T.bitacoraReciente(bit.length)}:`, ...bit.map((e) => `  - #${e.n} ${hora(e.t)} · ${e.texto}`));
          return l.join('\n');
        });
        return `${cabecera(st, null)}\n\n${bloques.join('\n\n')}`;
      }

      case 'bro_historial': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const st = almacen.estadoSala(sala);
        const desde = entero(args, 'desde', { def: 0, min: 0, max: 10_000_000 });
        const ultimos = entero(args, 'ultimos', { def: 60, min: 1, max: 2000 });
        let lista = almacen.entradasDesde(sala, Math.max(0, desde - 1));
        if (args.incluir_bitacora === false) lista = lista.filter((e) => !(e.tipo === 'mensaje' && e.clase === 'bitacora'));
        const omitidas = Math.max(0, lista.length - ultimos);
        lista = lista.slice(-ultimos);
        const lote = formatearLote(lista, st, { maxChars: MAX_SALIDA, fichasCompletas: false });
        const l = [cabecera(st, null), `${T.temaL()}: ${st.meta.tema}${st.meta.objetivo ? ` · ${T.objetivoL()}: ${st.meta.objetivo}` : ''}`];
        if (omitidas) l.push(T.omitidas(omitidas, P('desde'), P('ultimos')));
        l.push('', lote.texto || T.sinEntradas());
        if (lote.restantes) l.push('', T.quedanEntradas(lote.restantes, P('desde'), (lote.hasta || 0) + 1));
        if (st.cierre) l.push('', T.cierreLinea(st.cierre.n, st.cierre.de || '?', st.cierre.resumen));
        return l.join('\n');
      }

      case 'bro_salas': {
        const salas = almacen.listarSalas({ incluirCerradas: !!args.incluir_cerradas });
        const l = [];
        if (!salas.length) l.push(args.incluir_cerradas ? T.noHaySalas() : T.noHaySalasAbiertas(P('incluir_cerradas')));
        for (const s of salas) {
          l.push(`- ${T.cita(s.id)} · ${V(s.estado)}${s.permanente ? ` · ${T.permanente()}` : ''} · ${s.tema} · ${s.permanente ? T.mensajesSinLimite(s.mensajes) : `${s.mensajes}/${s.limite}`} · ${T.participantesMin()}: ${s.participantes.join(', ') || T.nadie()} · ${T.ultimaActividad(hace(s.ultimaActividad))}`);
        }
        const huerf = textoHuerfanas(null, 5);
        if (huerf) l.push('', huerf);
        return l.join('\n');
      }

      case 'bro_cerrar': {
        const sala = texto(args, 'sala', { obligatorio: true, max: 60 });
        almacen.exigirSala(sala);
        const yo = validarNombre(args.yo);
        const st = almacen.estadoSala(sala);
        const p = exigirParticipante(st, yo);
        if (st.estado === 'cerrada') throw new ErrorBro(T.yaCerradaPor(st.cierre?.de || '?', st.cierre?.resumen));
        const resumen = texto(args, 'resumen', { obligatorio: true, max: 30_000 });
        const e = almacen.anotar(sala, { tipo: 'sala', accion: 'cerrada', de: p.nombre, resumen });
        const st2 = almacen.estadoSala(sala);
        const ev = almacen.reservasEvaluadas(st2);
        const abiertas = [...st2.tablero.values()].filter((it) => (it.tipo === 'reserva' && ['activa', 'en_cola'].includes(ev.get(it.id)?.estado))
          || (it.tipo === 'tarea' && ['pendiente', 'en_curso', 'bloqueada'].includes(it.estado)));
        return T.salaCerradaOk(sala, e.n, abiertas.map((it) => `${it.id} (${V(it.tipo === 'reserva' ? ev.get(it.id).estado : it.estado)})`).join(', '));
      }

      case 'bro_visor': {
        if (!ctx.visor) throw new ErrorBro(T.visorNoDisponible());
        const url = await ctx.visor.asegurar();
        if (!url) throw new ErrorBro(T.visorNoArranca());
        const destino = args.sala ? `${url}#${slug(args.sala, 60)}` : url;
        const abierto = args.abrir !== false ? await ctx.visor.abrirNavegador(destino) : false;
        return abierto ? T.visorAbierto(destino) : T.visorDisponible(destino);
      }

      default:
        throw new ErrorBro(T.herramientaDesconocida(nombre));
    }
  }

  async function ejecutar(nombre, args, extra) {
    const canon = NOMBRE_ES[nombre] || nombre;
    try {
      const salida = await manejar(canon, normalizarArgs(args || {}), extra || {});
      return { content: [{ type: 'text', text: salida }] };
    } catch (e) {
      const msg = e instanceof ErrorBro ? e.message : T.errorInterno(e?.message || String(e));
      if (!(e instanceof ErrorBro)) console.error('[hey-bro]', e);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }

  return { DEFINICIONES, INSTRUCCIONES: T.instrucciones(H), ejecutar, formatearTablero, hora };
}
