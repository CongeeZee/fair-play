import client from './client'
import type { TeeTimesListResponse, TeeTimeDetail } from '../types'

export const getTeeTimes = () =>
  client.get<TeeTimesListResponse>('/teetimes').then((r) => r.data)

export const getTeeTime = (id: string) =>
  client.get<TeeTimeDetail>(`/teetimes/${id}`).then((r) => r.data)

export const createTeeTime = (data: {
  courseId?: number
  courseName?: string
  dateTime: string
  spotsTotal: number
  notes?: string
  visibility: 'FRIENDS' | 'INVITED_ONLY'
  inviteUserIds?: number[]
}) => client.post<TeeTimeDetail>('/teetimes', data).then((r) => r.data)

export const inviteToTeeTime = (id: string, userIds: number[]) =>
  client.post<{ invited: number }>(`/teetimes/${id}/invite`, { userIds }).then((r) => r.data)

export const joinTeeTime = (id: string) =>
  client.post<{ status: string }>(`/teetimes/${id}/join`).then((r) => r.data)

export const respondToTeeTime = (id: string, response: 'CONFIRMED' | 'DECLINED') =>
  client.post<{ status: string }>(`/teetimes/${id}/respond`, { response }).then((r) => r.data)

export const withdrawFromTeeTime = (id: string) =>
  client.post<{ status: string }>(`/teetimes/${id}/withdraw`).then((r) => r.data)

export const cancelTeeTime = (id: string) =>
  client.post<{ status: string }>(`/teetimes/${id}/cancel`).then((r) => r.data)

export const updateTeeTime = (id: string, data: {
  courseId?: number | null
  courseName?: string | null
  dateTime?: string
  spotsTotal?: number
  notes?: string | null
}) => client.patch<TeeTimeDetail>(`/teetimes/${id}`, data).then((r) => r.data)

export const deleteTeeTime = (id: string) =>
  client.delete(`/teetimes/${id}`)
