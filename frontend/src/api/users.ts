import client from './client'
import type { UserProfile, HeadToHead } from '../types'

export const getUserProfile = (userId: number) =>
  client.get<UserProfile>(`/users/${userId}/profile`).then((r) => r.data)

export const getHeadToHead = (userId: number) =>
  client.get<HeadToHead>(`/users/${userId}/head-to-head`).then((r) => r.data)

export const getUserHandicapHistory = (userId: number) =>
  client.get<Array<{ date: string; handicapIndex: number }>>(`/users/${userId}/handicap-history`).then((r) => r.data)

export const updateProfile = (data: { name: string }) =>
  client.patch('/auth/profile', data).then((r) => r.data)

/** Upload a (pre-resized) profile photo; returns its new version. */
export const uploadProfilePhoto = (image: Blob) =>
  client
    .put<{ version: number }>('/photos/me', image, { headers: { 'Content-Type': image.type || 'image/jpeg' } })
    .then((r) => r.data)

export const removeProfilePhoto = () => client.delete('/photos/me').then((r) => r.data)
