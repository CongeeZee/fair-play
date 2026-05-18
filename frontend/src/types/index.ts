export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  createdAt: string
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
}

export interface Hole {
  id: string
  number: number
  par: number
  distance: number
  courseId: string
  greenLatitude?: number | null
  greenLongitude?: number | null
}

export interface Course {
  id: string
  name: string
  externalId?: string | null
  holes: Hole[]
}

export interface RoundHole {
  id: string
  roundId: string
  holeId: string
  strokes: number
  putts?: number
  teeShotDirection?: string
  teeShotDistance?: string
  approachResult?: string
  sandShots?: number
  penalties?: number
  hazards?: number
}

export interface Round {
  id: string
  shareId?: string | null
  playedAt: string
  userId: string
  courseId: string
  course: Course
  roundHoles: RoundHole[]
  totalStrokes?: number
  scoreToPar?: number
  holesCompleted?: number
}

export interface SharedScorecard {
  playerName: string
  courseName: string
  playedAt: string
  inProgress: boolean
  holesScored: number
  totalHoles: number
  holes: Array<{
    number: number
    par: number
    distance: number
    strokes: number | null
    putts: number | null
    scoreToPar: number | null
  }>
  frontNine: { strokes: number; par: number }
  backNine: { strokes: number; par: number } | null
  total: { strokes: number; par: number; scoreToPar: number }
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

export interface CourseStatsSummary {
  courseId: string
  courseName: string
  roundsPlayed: number
  averageScoreToPar: number
  bestScoreToPar: number
  rounds: Array<{
    roundId: string
    playedAt: string
    scoreToPar: number
    totalStrokes: number
    holesCompleted: number
  }>
}

export interface CourseHoleStat {
  holeId: string
  number: number
  par: number
  distance: number
  roundsPlayed: number
  averageScoreToPar: number | null
  averagePutts: number | null
  girRate: number | null
  fairwayRate: number | null
}

export interface CourseDetailStats {
  courseId: string
  courseName: string
  holes: CourseHoleStat[]
}

export interface InsightSuggestion {
  area: string
  message: string
  severity: 'high' | 'medium' | 'low'
}

export interface InsightsResult {
  hasData: boolean
  dataPoints?: number
  metrics?: {
    avgPutts: number | null
    threePuttRate: number | null
    girRate: number | null
    fairwayRate: number | null
    doublePlusRate: number | null
    par3: { count: number; averageScoreToPar: number } | null
    par4: { count: number; averageScoreToPar: number } | null
    par5: { count: number; averageScoreToPar: number } | null
    approachMisses: { left: number; right: number; short: number; long: number; total: number } | null
  }
  suggestions?: InsightSuggestion[]
}

export interface HandicapResult {
  handicapIndex: number | null
  differentialsUsed: number
  totalEligible: number
  minimumRequired?: number
  differentials: HandicapDifferential[]
}

export interface HandicapHistoryPoint {
  date: string
  handicapIndex: number
  roundNumber: number
  courseName: string
}

export interface LinkedHandicap {
  id: number
  source: 'golf_australia' | 'ghin' | 'manual'
  externalId?: string | null
  handicapIndex: number
  playerName?: string | null
  clubName?: string | null
  lastSynced: string
}

export interface HandicapLookupResult {
  handicapIndex: number
  playerName?: string
  clubName?: string
}
