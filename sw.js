// BlueNexus Service Worker - v1.0
// Stratégie : NETWORK-FIRST (mises à jour visibles immédiatement en ligne)
//             + fallback cache (mode offline)

const CACHE_NAME = 'bluenexus-v1';
const OFFLINE_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json'
];

// ============ INSTALLATION ============
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_URLS).catch(err => {
        console.warn('[SW] Cache partiel:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ============ ACTIVATION ============
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Suppression ancien cache:', key);
          return caches.delete(key);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ============ FETCH ============
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 1. Ne jamais intercepter les API externes
  const externalHosts = [
    'firebase', 'firebaseio', 'googleapis', 'gstatic',
    'cloudinary', 'vercel.app', 'mymemory', 'qrserver',
    'wa.me', 'whatsapp', 'tencent'
  ];
  if (externalHosts.some(h => url.hostname.includes(h))) return;
  
  // 2. Seulement les GET
  if (event.request.method !== 'GET') return;
  
  // 3. Network-first avec fallback cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// ============ MESSAGE (kill-switch manuel possible) ============
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
