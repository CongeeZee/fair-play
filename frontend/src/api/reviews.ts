import client from './client'

export interface ReviewPayload {
  rating: number
  conditionRating?: number | null
  valueRating?: number | null
  paceRating?: number | null
  text?: string | null
}

export interface CourseReviewSummary {
  averageRating: number | null
  totalReviews: number
}

export interface CourseReviewItem {
  id: string
  userId: number
  userName: string
  rating: number
  conditionRating: number | null
  valueRating: number | null
  paceRating: number | null
  text: string | null
  playedAt: string
  scoreToPar: number | null
  createdAt: string
}

export interface CourseReviewsResponse {
  averageRating: number | null
  totalReviews: number
  averageCondition: number | null
  averageValue: number | null
  averagePace: number | null
  ratingDistribution: Record<string, number>
  reviews: CourseReviewItem[]
}

export interface UserReviewItem {
  id: string
  courseId: number
  courseName: string
  roundId: number
  playedAt: string
  rating: number
  conditionRating: number | null
  valueRating: number | null
  paceRating: number | null
  text: string | null
  createdAt: string
}

export const createReview = (roundId: number, body: ReviewPayload) =>
  client.post(`/rounds/${roundId}/review`, body).then((r) => r.data)

export const updateReview = (roundId: number, body: ReviewPayload) =>
  client.put(`/rounds/${roundId}/review`, body).then((r) => r.data)

export const deleteReview = (roundId: number) =>
  client.delete(`/rounds/${roundId}/review`).then((r) => r.data)

export const getCourseReviewsSummary = (courseId: string | number) =>
  client
    .get<CourseReviewSummary>(`/courses/${courseId}/reviews/summary`)
    .then((r) => r.data)

export const getCourseReviews = (courseId: string | number, page = 1, limit = 10) =>
  client
    .get<CourseReviewsResponse>(`/courses/${courseId}/reviews`, { params: { page, limit } })
    .then((r) => r.data)

export const getUserReviews = (userId: number) =>
  client.get<UserReviewItem[]>(`/users/${userId}/reviews`).then((r) => r.data)
