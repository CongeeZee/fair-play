import client from './client'
import type { LiveRoundsResponse, LiveScorecard } from '../types'

export const getLiveRounds = () =>
  client.get<LiveRoundsResponse>('/rounds/live').then((r) => r.data)

export const getLiveScorecard = (roundId: number) =>
  client.get<LiveScorecard>(`/rounds/${roundId}/live-scorecard`).then((r) => r.data)
