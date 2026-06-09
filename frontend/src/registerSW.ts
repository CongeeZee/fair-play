// Service worker registration shared by the app shell (offline launch,
// install criteria) and the push notification hook. Registering early — and
// independent of PushManager support — is what makes the app installable on
// browsers like iOS Safari that don't expose push APIs.

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => {
        console.error('SW registration failed:', err)
        registrationPromise = null
        throw err
      })
  }
  return registrationPromise
}
