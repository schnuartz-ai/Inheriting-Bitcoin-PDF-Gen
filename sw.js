const CACHE_NAME = 'bitcoin-inheritance-offline-v30';
const CORE_URLS = ['./', './index.html', './diagram.css', './diagram.js', './assets/apps/bitwarden.png', './assets/clavastack-logo.png', './assets/products/smartcard.png', './assets/diagram/backup-paper-rip.png', './assets/diagram/backup-tamper-evident-bag.png', './assets/diagram/backup-paper.png', './assets/diagram/backup-metal.png', './assets/diagram/smartcard.png', './assets/diagram/seed.png', './site.webmanifest', ...['mnemonic','safe','smartcard','tree-structure','wallet','shared-wallet','two-keys','file','password','cloud','clock','contacts','exchange','devices','printer'].map(name => './assets/bitcoin-icons/' + name + '.svg')];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return caches.match('./index.html');
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return (await caches.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        cache.put('./', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && /\/(diagram\.js|diagram\.css)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
