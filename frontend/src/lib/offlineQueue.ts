import { get, set, del, keys, entries } from 'idb-keyval'

export interface QueuedRequest {
  id: string
  url: string
  method: string
  body: unknown
  timestamp: number
}

const PREFIX = 'offline-queue:'

function queueKey(id: string) {
  return `${PREFIX}${id}`
}

export async function queueRequest(url: string, method: string, body: unknown): Promise<void> {
  const id = crypto.randomUUID()
  const item: QueuedRequest = { id, url, method, body, timestamp: Date.now() }
  await set(queueKey(id), item)
}

export async function getQueueLength(): Promise<number> {
  const allKeys = await keys()
  return allKeys.filter((k) => String(k).startsWith(PREFIX)).length
}

export async function getQueuedRequests(): Promise<QueuedRequest[]> {
  const all = await entries()
  return all
    .filter(([k]) => String(k).startsWith(PREFIX))
    .map(([, v]) => v as QueuedRequest)
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** Deduplicate: for the same url+method, keep only the latest entry */
function deduplicate(items: QueuedRequest[]): { toReplay: QueuedRequest[]; toRemove: string[] } {
  const latest = new Map<string, QueuedRequest>()
  const toRemove: string[] = []

  for (const item of items) {
    const key = `${item.method}:${item.url}`
    const existing = latest.get(key)
    if (existing) {
      // Remove the older one
      toRemove.push(existing.timestamp < item.timestamp ? existing.id : item.id)
      latest.set(key, existing.timestamp < item.timestamp ? item : existing)
    } else {
      latest.set(key, item)
    }
  }

  const toReplay = Array.from(latest.values()).sort((a, b) => a.timestamp - b.timestamp)
  return { toReplay, toRemove }
}

export type FlushResult = { synced: number; failed: number }

export async function flushQueue(
  sendRequest: (url: string, method: string, body: unknown) => Promise<boolean>,
): Promise<FlushResult> {
  const items = await getQueuedRequests()
  if (items.length === 0) return { synced: 0, failed: 0 }

  const { toReplay, toRemove } = deduplicate(items)

  // Remove stale duplicates first
  for (const id of toRemove) {
    await del(queueKey(id))
  }

  let synced = 0
  let failed = 0

  for (const item of toReplay) {
    const ok = await sendRequest(item.url, item.method, item.body)
    if (ok) {
      await del(queueKey(item.id))
      synced++
    } else {
      failed++
    }
  }

  return { synced, failed }
}
