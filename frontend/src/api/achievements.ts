import client from './client'
import type { UserAchievementsResponse, RecentAchievement } from '../types'

export const getUserAchievements = (userId: number) =>
  client.get<UserAchievementsResponse>(`/users/${userId}/achievements`).then((r) => r.data)

export const getRecentAchievements = () =>
  client.get<RecentAchievement[]>('/achievements/recent').then((r) => r.data)
