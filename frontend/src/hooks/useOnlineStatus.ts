import { useState, useEffect, useCallback, useRef } from 'react'
import { flushQueue, getQueueLength, type FlushResult } from '../lib/offlineQueue'
import { sendRawRequest } from '../api/client'

export type SyncState = 'idle' | 'offline' | 'syncing' | 'synced'

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline')
  const [pendingCount, setPendingCount] = useState(0)
  const syncedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshCount = useCallback(async () => {
    const count = await getQueueLength()
    setPendingCount(count)
    return count
  }, [])

  const doFlush = useCallback(async () => {
    const count = await getQueueLength()
    if (count === 0) return

    setSyncState('syncing')
    const result: FlushResult = await flushQueue(sendRawRequest)
    await refreshCount()

    if (result.failed === 0) {
      setSyncState('synced')
      if (syncedTimer.current) clearTimeout(syncedTimer.current)
      syncedTimer.current = setTimeout(() => setSyncState('idle'), 3000)
    } else {
      setSyncState('idle')
    }
  }, [refreshCount])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setSyncState('idle')
      doFlush()
    }
    const handleOffline = () => {
      setOnline(false)
      setSyncState('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check for queued items on mount
    refreshCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (syncedTimer.current) clearTimeout(syncedTimer.current)
    }
  }, [doFlush, refreshCount])

  return { online, syncState, pendingCount, flush: doFlush, refreshCount }
}
