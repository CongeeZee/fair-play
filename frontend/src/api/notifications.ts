import client from './client'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  url: string
  read: boolean
  createdAt: string
  actor: { id: number; name: string } | null
}

export interface NotificationInbox {
  unreadCount: number
  items: AppNotification[]
}

export const getNotifications = () =>
  client.get<NotificationInbox>('/notifications').then((r) => r.data)

export const getUnreadCount = () =>
  client.get<{ unreadCount: number }>('/notifications/unread-count').then((r) => r.data.unreadCount)

/** Mark the given notifications read, or every unread one when `ids` is omitted. */
export const markNotificationsRead = (ids?: string[]) =>
  client.post<{ updated: number }>('/notifications/read', ids ? { ids } : {}).then((r) => r.data)
