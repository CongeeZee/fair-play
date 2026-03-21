import client from './client'
import type { Round, Stats, HandicapResult } from '../types'

export const createRound = (params: { courseId?: string; externalCourseId?: string; teeName?: string; playedAt?: string }) =>
  client.post<Round>('/rounds', params).then((r) => r.data)

export const scoreHole = (roundId: string, holeId: string, strokes: number) =>
  client.put(`/rounds/${roundId}/holes/${holeId}`, { strokes }).then((r) => r.data)

export const getRounds = () =>
  client.get<Round[]>('/rounds').then((r) => r.data)

export const getRound = (id: string) =>
  client.get<Round>(`/rounds/${id}`).then((r) => r.data)

export const deleteRound = (id: string) =>
  client.delete(`/rounds/${id}`)

export const getStats = () =>
  client.get<Stats>('/rounds/stats').then((r) => r.data)

export const getHandicap = () =>
  client.get<HandicapResult>('/rounds/handicap').then((r) => r.data)
