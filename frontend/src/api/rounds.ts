import client from './client'
import axios from 'axios'
import type { Round, Stats, HandicapResult, HandicapHistoryPoint, CourseStatsSummary, CourseDetailStats, InsightsResult, SharedScorecard, FeedResponse, LeaderboardEntry, HandicapLeaderboardEntry, NewlyUnlockedAchievement, RoundHole, RoundPartner } from '../types'

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

export interface ScoreHoleResponse extends RoundHole {
  newlyUnlocked: NewlyUnlockedAchievement[]
}

export const scoreHole = (roundId: string, holeId: string, data: HoleScore) =>
  client.put<ScoreHoleResponse>(`/rounds/${roundId}/holes/${holeId}`, data).then((r) => r.data)

export const getRounds = () =>
  client.get<Round[]>('/rounds').then((r) => r.data)

export const getRound = (id: string) =>
  client.get<Round>(`/rounds/${id}`).then((r) => r.data)

export const setRoundPartners = (id: string | number, userIds: number[]) =>
  client.put<{ partners: RoundPartner[] }>(`/rounds/${id}/partners`, { userIds }).then((r) => r.data)

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

export const getFeed = (cursor?: number) =>
  client.get<FeedResponse>('/rounds/feed', { params: cursor ? { cursor } : {} }).then((r) => r.data)

export const getLeaderboard = (timeframe: string) =>
  client.get<LeaderboardEntry[]>('/rounds/leaderboard', { params: { timeframe } }).then((r) => r.data)

export const getHandicapLeaderboard = () =>
  client.get<HandicapLeaderboardEntry[]>('/rounds/leaderboard/handicap').then((r) => r.data)

export const getSharedScorecard = (shareId: string) =>
  axios.get<SharedScorecard>(`${import.meta.env.VITE_API_URL || '/api'}/rounds/shared/${shareId}`).then((r) => r.data)

// ── Linked Handicap ─────────────────────────────────────────────────────────

import type { LinkedHandicap } from '../types'

export const getLinkedHandicap = () =>
  client.get<LinkedHandicap | null>('/handicap/linked').then((r) => r.data)

export const linkHandicap = (data: {
  source: 'manual'
  externalId?: string
  handicapIndex: number
  playerName?: string
  clubName?: string
}) => client.post<LinkedHandicap>('/handicap/link', data).then((r) => r.data)

export const unlinkHandicap = () =>
  client.delete('/handicap/link')

export const refreshLinkedHandicap = () =>
  client.post<LinkedHandicap>('/handicap/refresh').then((r) => r.data)
