// Diferencias por líneas entre dos versiones de un texto (para enviar solo lo que cambia
// de un dossier). LCS clásica con tope de tamaño; si el texto es enorme, se devuelve null
// y quien llama muestra el texto nuevo completo.

const MAX_CELDAS = 4_000_000;

export function diferenciaLineas(antes, despues, { maxLineas = 400 } = {}) {
  const a = String(antes ?? '').split(/\r?\n/);
  const b = String(despues ?? '').split(/\r?\n/);
  // Recorta prefijo y sufijo comunes (lo habitual es que cambie una parte).
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let finA = a.length - 1;
  let finB = b.length - 1;
  while (finA >= ini && finB >= ini && a[finA] === b[finB]) { finA--; finB--; }
  const A = a.slice(ini, finA + 1);
  const B = b.slice(ini, finB + 1);
  if (!A.length && !B.length) return { lineas: [], sinCambios: true };
  if (A.length * B.length > MAX_CELDAS) return null;

  // Tabla LCS (longitudes) de abajo arriba.
  const n = A.length;
  const m = B.length;
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = A[i] === B[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const lineas = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { i++; j++; continue; }
    if (j < m && (i >= n || t[i][j + 1] >= t[i + 1][j])) { lineas.push(`+ ${B[j]}`); j++; } else { lineas.push(`- ${A[i]}`); i++; }
  }
  const recortado = lineas.length > maxLineas;
  return {
    lineas: recortado ? lineas.slice(0, maxLineas) : lineas,
    recortado,
    total: lineas.length,
    sinCambios: false,
  };
}
