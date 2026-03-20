import client from './client'
import type { Course } from '../types'

export interface ExternalCourse {
  id: number
  course_name: string
  club_name?: string
  location?: { city?: string; state?: string; country?: string }
}

export const getCourses = (search?: string) =>
  client.get<Course[]>('/courses', { params: search ? { search } : undefined }).then((r) => r.data)

export const getCourse = (id: string) =>
  client.get<Course>(`/courses/${id}`).then((r) => r.data)

export interface TeeOption {
  name: string
  gender: 'male' | 'female'
  totalYards: number
  parTotal: number
}

export interface CourseTees {
  courseName: string
  clubName?: string
  tees: TeeOption[]
}

export const searchExternalCourses = (q: string) =>
  client.get<ExternalCourse[]>('/courses/search', { params: { q } }).then((r) => r.data)

export const getExternalCourseTees = (externalId: string) =>
  client.get<CourseTees>(`/courses/tees/${externalId}`).then((r) => r.data)

export const createCourse = (name: string, holes: { number: number; par: number; distance: number }[]) =>
  client.post<Course>('/courses', { name, holes }).then((r) => r.data)
