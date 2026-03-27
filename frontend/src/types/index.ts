export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface Hole {
  id: string
  number: number
  par: number
  distance: number
  courseId: string
}

export interface Course {
  id: string
  name: string
  holes: Hole[]
}

export interface RoundHole {
  id: string
  roundId: string
  holeId: string
  strokes: number
  putts?: number
  teeShotDirection?: string
  sandShots?: number
  penalties?: number
  hazards?: number
}

export interface Round {
  id: string
  playedAt: string
  userId: string
  courseId: string
  course: Course
  roundHoles: RoundHole[]
  totalStrokes?: number
  scoreToPar?: number
  holesCompleted?: number
}

export interface HoleBreakdown {
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doublesOrWorse: number
}

export interface Stats {
  roundsPlayed: number
  averageScoreToPar?: number
  bestScoreToPar?: number
  worstScoreToPar?: number
  holeBreakdown?: HoleBreakdown
}

export interface HandicapDifferential {
  roundId: string
  playedAt: string
  courseName: string
  gross: number
  courseRating: number
  slopeRating: number
  differential: number
  used: boolean
}

export interface HandicapResult {
  handicapIndex: number | null
  differentialsUsed: number
  totalEligible: number
  minimumRequired?: number
  differentials: HandicapDifferential[]
}
