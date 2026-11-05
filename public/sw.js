// Service worker : installation sur l'écran d'accueil + notifications push (les données restent toujours chargées en direct)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.titre || 'SamaTool', {
    body: d.texte || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    for (const f of fenetres) if ('focus' in f) { f.navigate(url); return f.focus(); }
    return self.clients.openWindow(url);
  }));
});
