// Identificación del dispositivo para el registro anti-trampas.
// - deviceId: identificador aleatorio guardado en el navegador.
// - fp: "huella" calculada a partir de características del navegador/pantalla.
//   Sirve para detectar al mismo dispositivo aunque borre datos o use incógnito.
// No se guarda la IP ni ningún otro dato personal.

function fnv(str, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('cg_device');
    if (!id) {
      id = randomId();
      localStorage.setItem('cg_device', id);
    }
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
}

function canvasSignature() {
  try {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 40;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 5, 90, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cultura General ¿? 🎲', 4, 12);
    return c.toDataURL();
  } catch {
    return '';
  }
}

function fingerprint() {
  const n = navigator;
  const parts = [
    n.userAgent,
    n.language,
    (n.languages || []).join(','),
    n.platform,
    n.hardwareConcurrency,
    n.deviceMemory,
    n.maxTouchPoints,
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasSignature(),
  ].join('|');
  return fnv(parts) + fnv(parts, 0x811c9dc5 ^ 0x5bd1e995);
}

function shortUA() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Otro';
  const br = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  return `${br} · ${os}`;
}

let cache = null;
export function getIdentity() {
  if (!cache) cache = { deviceId: getDeviceId(), fp: fingerprint(), ua: shortUA() };
  return cache;
}

// Nombres usados en este navegador (se incluyen en cada entrada del registro).
export function rememberName(name) {
  try {
    const list = JSON.parse(localStorage.getItem('cg_names') || '[]');
    if (!list.includes(name)) list.push(name);
    localStorage.setItem('cg_names', JSON.stringify(list.slice(-50)));
    return list;
  } catch {
    return [name];
  }
}
