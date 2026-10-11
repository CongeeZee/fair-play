import { useEffect, useSyncExternalStore } from 'react'

/**
 * Which users have a profile photo, and its version.
 *
 * Every avatar on screen asks for its user. Those asks are collected for one
 * tick and sent as a single `/photos/versions?ids=…` request, so a feed of 20
 * cards costs one small request, not 20 — and the answer comes from the
 * server's memory, not the database. Answers are kept on the device so the
 * next visit shows photos immediately; they are re-checked after a while.
 *
 * `undefined` = not known yet, `null` = no photo, a number = photo version.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const STORAGE_KEY = 'fairplay-photo-versions'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

type Entry = { v: number | null; at: number }
const versions = new Map<number, Entry>()
const listeners = new Set<() => void>()
const pending = new Set<number>()
let timer: ReturnType<typeof setTimeout> | null = null

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, Entry>
  for (const [id, e] of Object.entries(saved)) versions.set(Number(id), e)
} catch { /* storage unavailable or corrupt — start empty */ }

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(versions)))
  } catch { /* storage full or unavailable */ }
}

function notify() {
  for (const l of listeners) l()
}

async function flush() {
  timer = null
  const ids = [...pending]
  pending.clear()
  if (ids.length === 0) return
  try {
    const res = await fetch(`${API_BASE}/photos/versions?ids=${ids.join(',')}`)
    if (!res.ok) return
    const data = (await res.json()) as Record<string, number>
    const now = Date.now()
    for (const id of ids) versions.set(id, { v: data[id] ?? null, at: now })
    save()
    notify()
  } catch {
    // Offline or API down: avatars keep showing initials, and the next mount retries
  }
}

function want(id: number) {
  const e = versions.get(id)
  if (e && Date.now() - e.at < MAX_AGE_MS) return
  pending.add(id)
  if (!timer) timer = setTimeout(flush, 0)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The user's photo version, fetched (batched) on first use. */
export function usePhotoVersion(userId: number): number | null | undefined {
  useEffect(() => {
    if (userId > 0) want(userId)
  }, [userId])
  return useSyncExternalStore(subscribe, () => versions.get(userId)?.v)
}

/** Record a change made on this device (upload or removal) so it shows at once. */
export function setPhotoVersion(userId: number, v: number | null) {
  versions.set(userId, { v, at: Date.now() })
  save()
  notify()
}

export function photoUrl(userId: number, version: number) {
  return `${API_BASE}/photos/${userId}?v=${version}`
}

/**
 * Turn a picked file into a small square JPEG: centre-cropped, 320px, ~85%
 * quality — typically 20-40KB, well under the server's limit, and the same
 * on every browser (Safari can't encode WebP from a canvas).
 */
export async function prepareProfilePhoto(file: File, size = 320): Promise<Blob> {
  // Honour the camera's EXIF rotation so portrait selfies aren't sideways
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.85))
}
