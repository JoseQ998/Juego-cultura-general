// Service worker mínimo para poder instalar el juego como aplicación.
// No guarda nada en el dispositivo: todo se pide a la red como en el navegador, así cada versión nueva
// se ve al momento. Por eso tampoco tiene manejador de fetch (la aplicación necesita conexión).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Por si alguna vez hubo cachés, se borran.
    for (const k of await caches.keys()) await caches.delete(k);
    await self.clients.claim();
  })());
});
