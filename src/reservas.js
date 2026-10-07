// Reservas con modos (exclusiva / compartida) y cola FIFO.
//
// Cada reserva guarda sus "periodos": uno al crearse y otro cada vez que se reactiva tras
// liberarse o caducar. El estado de cada periodo NO se guarda: se calcula a partir de los
// hechos del registro (cuándo se pidió, cuándo se renovó, cuándo se liberó) y de la hora
// actual. Así la caducidad y el paso de turno son deterministas y no necesitan escrituras.
//
// Reglas:
//  - Dos periodos chocan si comparten recurso y alguno de los dos es exclusivo.
//  - Un periodo empieza cuando han terminado todos los periodos anteriores con los que choca
//    (orden de llegada estricto: nadie se cuela aunque quede un hueco).
//  - Termina al liberarse o al cumplirse su duración, contada desde que empezó o desde su
//    última renovación.

export const MODOS = ['exclusiva', 'compartida'];

export function claveRecurso(texto) {
  return String(texto ?? '').trim().toLowerCase().replace(/\\/g, '/').replace(/\s+/g, ' ').replace(/\/+$/, '');
}

const chocan = (a, b) => a === 'exclusiva' || b === 'exclusiva';

function finPlanificado(periodo, inicio, duracionMs) {
  let base = inicio;
  for (const r of periodo.renov) {
    const t = Date.parse(r);
    if (t >= base && t <= base + duracionMs) base = t; // renovación dentro de plazo
  }
  return base + duracionMs;
}

// Evalúa todas las reservas de un tablero en el instante «ahora» (ms).
// Devuelve Map(id → { estado, inicio, fin, posicion, delante, recurso }).
//   estado: 'activa' | 'en_cola' | 'liberada' | 'caducada' | 'rechazada'
export function evaluarReservas(items, ahora = Date.now()) {
  const res = new Map();
  const grupos = new Map();
  for (const it of items) {
    if (it.tipo !== 'reserva') continue;
    if (it.estado === 'rechazada' || !Array.isArray(it.periodos) || !it.periodos.length) {
      res.set(it.id, { estado: 'rechazada', inicio: null, fin: null, posicion: null, delante: [], recurso: claveRecurso(it.titulo) });
      continue;
    }
    const k = claveRecurso(it.titulo);
    if (!grupos.has(k)) grupos.set(k, []);
    it.periodos.forEach((p, i) => grupos.get(k).push({ it, p, ultimo: i === it.periodos.length - 1 }));
  }
  for (const [recurso, lista] of grupos) {
    lista.sort((a, b) => a.p.n - b.p.n);
    const concedidos = [];
    for (const { it, p, ultimo } of lista) {
      const dur = (Number(it.duracion_min) || 240) * 60_000;
      const pedido = Date.parse(p.pedido_t);
      let inicio = pedido;
      const delante = [];
      const titular = String(it.responsable || '').toLowerCase();
      for (const g of concedidos) {
        // Un mismo hermano no choca consigo mismo (para eso está renovar).
        if (g.titular !== titular && g.fin > pedido && chocan(g.modo, it.modo || 'exclusiva') && g.fin > g.inicio) {
          if (g.fin > inicio) inicio = g.fin;
          if (g.fin > ahora) delante.push(g.id);
        }
      }
      const plan = finPlanificado(p, inicio, dur);
      let fin = plan;
      let liberada = false;
      if (p.liberado_t) {
        const l = Date.parse(p.liberado_t);
        if (l <= inicio) { fin = inicio; liberada = true; } else if (l < plan) { fin = l; liberada = true; }
      }
      concedidos.push({ id: it.id, titular, modo: it.modo || 'exclusiva', inicio, fin });
      if (!ultimo) continue; // solo interesa el estado del periodo vigente
      let estado;
      if (fin <= inicio) estado = 'liberada';
      else if (ahora < inicio) estado = 'en_cola';
      else if (ahora < fin) estado = 'activa';
      else estado = liberada ? 'liberada' : 'caducada';
      res.set(it.id, { estado, inicio, fin, posicion: null, delante: estado === 'en_cola' ? [...new Set(delante)] : [], recurso });
    }
    // Posición en la cola de cada periodo en espera.
    const enCola = [...res.entries()].filter(([, v]) => v.recurso === recurso && v.estado === 'en_cola')
      .sort((a, b) => a[1].inicio - b[1].inicio);
    enCola.forEach(([, v], i) => { v.posicion = i + 1; });
  }
  return res;
}

// ¿El periodo nuevo de una reserva tendría que esperar? (para rechazar si no quiere cola)
export function tendriaQueEsperar(items, nuevo, t) {
  const prueba = [...items, nuevo];
  const ev = evaluarReservas(prueba, Date.parse(t));
  const r = ev.get(nuevo.id);
  return !!r && r.estado === 'en_cola';
}
