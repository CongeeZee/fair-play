import { useState, useEffect, useCallback } from 'react'
import client from '../api/client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)
    if (!supported) return

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      setRegistration(reg)
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    }).catch((err) => {
      console.error('SW registration failed:', err)
    })
  }, [])

  const subscribeToNotifications = useCallback(async () => {
    if (!registration) return false

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false

      // Get VAPID public key from backend
      const { data } = await client.get<{ publicKey: string }>('/notifications/vapid-key')

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      })

      const json = subscription.toJSON()
      await client.post('/notifications/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      })

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('Push subscription failed:', err)
      return false
    }
  }, [registration])

  const unsubscribeFromNotifications = useCallback(async () => {
    if (!registration) return

    try {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await client.delete('/notifications/subscribe', {
          data: { endpoint: subscription.endpoint },
        })
        await subscription.unsubscribe()
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('Push unsubscribe failed:', err)
    }
  }, [registration])

  return { isSupported, isSubscribed, subscribeToNotifications, unsubscribeFromNotifications }
}
