import client from './client'
import type { ReactionSummary, RoundCommentData } from '../types'

export const ALLOWED_EMOJI = ['\u{1F525}', '\u{1F44F}', '\u{1F602}', '\u{1F480}', '\u26F3'] as const

export const toggleReaction = (roundId: number, emoji: string) =>
  client.post<ReactionSummary>(`/rounds/${roundId}/react`, { emoji }).then((r) => r.data)

export const getReactions = (roundId: number) =>
  client.get<ReactionSummary>(`/rounds/${roundId}/reactions`).then((r) => r.data)

export const addComment = (roundId: number, text: string) =>
  client.post<RoundCommentData>(`/rounds/${roundId}/comments`, { text }).then((r) => r.data)

export const getComments = (roundId: number) =>
  client.get<RoundCommentData[]>(`/rounds/${roundId}/comments`).then((r) => r.data)

export const deleteComment = (roundId: number, commentId: string) =>
  client.delete(`/rounds/${roundId}/comments/${commentId}`).then((r) => r.data)
