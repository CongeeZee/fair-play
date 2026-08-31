// Bump this when shipping a new build to invalidate the precache.
const CACHE_VERSION = 'fairplay-shell-v2'

// Files that must be available offline for the app to launch. The Vite-built
// JS/CSS are hash-named, so we only precache the document + the static icons
// here and let the runtime fetch handler cache hashed assets on first use.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Only handle same-origin requests; let the browser handle cross-origin
  // (Google Fonts, Unsplash hero, PostHog, Sentry, etc).
  if (url.origin !== self.location.origin) return

  // Never intercept API calls — the offline IndexedDB mutation queue owns
  // those, and caching them would mask write failures.
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests → network-first, fall back to cached index for offline
  // launch. SPA routes all resolve to index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  // Static assets → cache-first with background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetchPromise
    }),
  )
})

self.addEventListener('push', (event) => {
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
