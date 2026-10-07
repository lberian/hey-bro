// Avisos del sistema (notificaciones) para el moderador humano.
// Windows: notificación nativa (toast) mediante PowerShell, sin módulos extra; al pulsarla se
// abre el visor en la sala. macOS: osascript. Linux: notify-send si existe.
// Si algo falla, no pasa nada: el aviso es una ayuda, nunca un requisito.

import { spawn } from 'node:child_process';

const AUMID_POWERSHELL = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/[\r\n]+/g, ' ');

export function scriptToast({ titulo, texto, detalle = '', url = '' }) {
  const lanzar = /^http:\/\/127\.0\.0\.1:\d+\/(#[a-z0-9-]*)?$/.test(url) ? ` activationType="protocol" launch="${xml(url)}"` : '';
  const toastXml = `<toast${lanzar}><visual><binding template="ToastGeneric"><text>${xml(titulo)}</text><text>${xml(texto)}</text>${detalle ? `<text>${xml(detalle)}</text>` : ''}</binding></visual></toast>`;
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
    "$xml.LoadXml(@'",
    toastXml,
    "'@)",
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $xml',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${AUMID_POWERSHELL}').Show($toast)`,
  ].join('\r\n');
}

function lanzar(cmd, args) {
  return new Promise((resolve) => {
    try {
      const hijo = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
      hijo.on('error', () => resolve(false));
      hijo.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export async function mostrarAviso({ titulo, texto, detalle = '', url = '' }) {
  if (process.env.HEYBRO_AVISOS_SIMULAR === '1') return true; // pruebas: se registra, pero no se muestra
  if (process.platform === 'win32') {
    const codificado = Buffer.from(scriptToast({ titulo, texto, detalle, url }), 'utf16le').toString('base64');
    return lanzar('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado]);
  }
  if (process.platform === 'darwin') {
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return lanzar('osascript', ['-e', `display notification "${esc(`${texto}${detalle ? ` — ${detalle}` : ''}`)}" with title "${esc(titulo)}"`]);
  }
  return lanzar('notify-send', [titulo, `${texto}${detalle ? `\n${detalle}` : ''}`]);
}
