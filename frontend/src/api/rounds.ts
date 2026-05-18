import client from './client'
import axios from 'axios'
import type { Round, Stats, HandicapResult, HandicapHistoryPoint, CourseStatsSummary, CourseDetailStats, InsightsResult, Hole, SharedScorecard } from '../types'

export const createRound = (params: { courseId?: string; externalCourseId?: string; teeName?: string; playedAt?: string }) =>
  client.post<Round>('/rounds', params).then((r) => r.data)

export interface HoleScore {
  strokes: number
  putts?: number
  teeShotDirection?: string
  teeShotDistance?: string
  approachResult?: string
  sandShots?: number
  penalties?: number
  hazards?: number
}

export const scoreHole = (roundId: string, holeId: string, data: HoleScore) =>
  client.put(`/rounds/${roundId}/holes/${holeId}`, data).then((r) => r.data)

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

export const getCourseStats = () =>
  client.get<CourseStatsSummary[]>('/rounds/course-stats').then((r) => r.data)

export const getCourseDetailStats = (courseId: string) =>
  client.get<CourseDetailStats>(`/rounds/course-stats/${courseId}`).then((r) => r.data)

export const getInsights = () =>
  client.get<InsightsResult>('/rounds/insights').then((r) => r.data)

export const getHandicapHistory = () =>
  client.get<HandicapHistoryPoint[]>('/rounds/handicap-history').then((r) => r.data)

export const markGreenLocation = (roundId: string, holeId: string, latitude: number, longitude: number) =>
  client.put<Hole>(`/rounds/${roundId}/mark-green/${holeId}`, { latitude, longitude }).then((r) => r.data)

export const getSharedScorecard = (shareId: string) =>
  axios.get<SharedScorecard>(`${import.meta.env.VITE_API_URL || '/api'}/rounds/shared/${shareId}`).then((r) => r.data)

// ── Linked Handicap ─────────────────────────────────────────────────────────

import type { LinkedHandicap, HandicapLookupResult } from '../types'

export const getLinkedHandicap = () =>
  client.get<LinkedHandicap | null>('/handicap/linked').then((r) => r.data)

export const lookupGolfAustralia = (golfLinkNo: string) =>
  client.get<HandicapLookupResult>(`/handicap/lookup/golf-australia/${golfLinkNo}`).then((r) => r.data)

export const lookupGHIN = (ghinNumber: string) =>
  client.get<HandicapLookupResult>(`/handicap/lookup/ghin/${ghinNumber}`).then((r) => r.data)

export const linkHandicap = (data: {
  source: 'golf_australia' | 'ghin' | 'manual'
  externalId?: string
  handicapIndex: number
  playerName?: string
  clubName?: string
}) => client.post<LinkedHandicap>('/handicap/link', data).then((r) => r.data)

export const unlinkHandicap = () =>
  client.delete('/handicap/link')

export const refreshLinkedHandicap = () =>
  client.post<LinkedHandicap>('/handicap/refresh').then((r) => r.data)
