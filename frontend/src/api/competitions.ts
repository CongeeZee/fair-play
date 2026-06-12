import client from './client'
import type {
  CompetitionsListResponse,
  CompetitionDetail,
  EligibleRound,
} from '../types'

export const getCompetitions = () =>
  client.get<CompetitionsListResponse>('/competitions').then((r) => r.data)

export const getCompetition = (id: string) =>
  client.get<CompetitionDetail>(`/competitions/${id}`).then((r) => r.data)

export const createCompetition = (data: {
  name: string
  courseId?: number
  startDate: string
  endDate: string
  scoringType: 'NET' | 'GROSS' | 'STABLEFORD'
  inviteUserIds?: number[]
}) => client.post<CompetitionDetail>('/competitions', data).then((r) => r.data)

export const inviteToCompetition = (compId: string, userIds: number[]) =>
  client.post<{ invited: number }>(`/competitions/${compId}/invite`, { userIds }).then((r) => r.data)

export const respondToCompetition = (compId: string, response: 'ACCEPTED' | 'DECLINED') =>
  client.post<{ status: string }>(`/competitions/${compId}/respond`, { response }).then((r) => r.data)

export const submitRound = (compId: string, roundId: number) =>
  client.post(`/competitions/${compId}/submit-round`, { roundId }).then((r) => r.data)

export const getEligibleRounds = (compId: string) =>
  client.get<EligibleRound[]>(`/competitions/${compId}/eligible-rounds`).then((r) => r.data)

export const deleteCompetition = (compId: string) =>
  client.delete(`/competitions/${compId}`)
