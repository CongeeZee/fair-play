import client from './client'
import type { Friend, FriendRequest, UserSearchResult } from '../types'

export const getFriends = () =>
  client.get<Friend[]>('/friends').then((r) => r.data)

export const getFriendRequests = () =>
  client.get<FriendRequest[]>('/friends/requests').then((r) => r.data)

export const searchUsers = (q: string) =>
  client.get<UserSearchResult[]>('/friends/search', { params: { q } }).then((r) => r.data)

export const sendFriendRequest = (addresseeId: number) =>
  client.post('/friends/request', { addresseeId }).then((r) => r.data)

export const acceptFriendRequest = (friendshipId: string) =>
  client.post(`/friends/accept/${friendshipId}`).then((r) => r.data)

export const declineFriendRequest = (friendshipId: string) =>
  client.post(`/friends/decline/${friendshipId}`).then((r) => r.data)

export const removeFriend = (friendshipId: string) =>
  client.delete(`/friends/${friendshipId}`).then((r) => r.data)

export const blockUser = (userId: number) =>
  client.post(`/friends/block/${userId}`).then((r) => r.data)

export const unblockUser = (userId: number) =>
  client.delete(`/friends/block/${userId}`).then((r) => r.data)
