import client from './client'
import type { InviteLink, InvitePreview, InviteAcceptResult } from '../types'

export interface CreateInviteInput {
  label?: string
  maxUses?: number
  expiresInDays?: number
}

export const createInvite = (input: CreateInviteInput = {}) =>
  client.post<InviteLink>('/invites', input).then((r) => r.data)

export const getMyInvites = () =>
  client.get<InviteLink[]>('/invites/mine').then((r) => r.data)

export const previewInvite = (code: string) =>
  client.get<InvitePreview>(`/invites/${code}`).then((r) => r.data)

export const acceptInvite = (code: string) =>
  client.post<InviteAcceptResult>(`/invites/${code}/accept`).then((r) => r.data)
