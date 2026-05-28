export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  hasCompletedOnboarding: boolean
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
  partners?: RoundPartner[]
}

export interface SharedScorecard {
  roundId: number
  ownerId: number
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

export interface RecentComment {
  userId: number
  name: string
  text: string
}

export interface FeedRoundReview {
  rating: number
  text: string | null
}

export interface RoundPartner {
  id: number
  name: string
}

export interface FeedRound {
  id: number
  shareId: string | null
  playerId: number
  playerName: string
  playedAt: string
  courseName: string
  totalStrokes: number
  scoreToPar: number
  totalHoles: number
  courseHoles: number
  reactionSummary: Record<string, number>
  userReaction: string | null
  commentCount: number
  recentComments: RecentComment[]
  review: FeedRoundReview | null
  partners: RoundPartner[]
  viewerTagged: boolean
}

export interface OwnLatestRound {
  id: number
  shareId: string | null
  playedAt: string
  courseName: string
  totalStrokes: number
  scoreToPar: number
  totalHoles: number
  courseHoles: number
  reactionSummary: Record<string, number>
  userReaction: string | null
  commentCount: number
  recentComments: RecentComment[]
  review: FeedRoundReview | null
  partners: RoundPartner[]
}

export interface RoundCommentData {
  id: string
  userName: string
  userId: number
  text: string
  createdAt: string
}

export interface ReactionSummary {
  summary: Record<string, number>
  userReaction: string | null
  names?: Record<string, Array<{ userId: number; name: string }>>
}

export interface FeedTeeTime {
  id: string
  type: 'tee_time'
  creatorId: number
  creatorName: string
  courseName: string | null
  dateTime: string
  spotsTotal: number
  spotsFilled: number
  notes: string | null
  createdAt: string
}

export interface FeedResponse {
  feed: FeedRound[]
  feedTeeTimes: FeedTeeTime[]
  nextCursor: number | null
  latestOwnRound: OwnLatestRound | null
}

export interface LeaderboardEntry {
  userId: number
  name: string
  roundsPlayed: number
  bestScoreToPar: number | null
  avgScoreToPar: number | null
  handicapIndex: number | null
}

export interface HandicapLeaderboardEntry {
  userId: number
  name: string
  handicapIndex: number | null
  trend: 'improving' | 'declining' | 'stable' | null
}

export interface Friend {
  id: number
  friendshipId: string
  name: string
  handicapIndex: number | null
}

export interface FriendRequest {
  friendshipId: string
  from: { id: number; name: string }
  sentAt: string
}

export interface UserSearchResult {
  id: number
  name: string
  isFriend: boolean
  isPending: boolean
  isBlocked: boolean
}

// ── Competitions ──────────────────────────────────────────────────────────────

export interface CompetitionSummary {
  id: string
  name: string
  creatorName: string
  creatorId: number
  course: { id: number; name: string } | null
  startDate: string
  endDate: string
  scoringType: 'NET' | 'GROSS'
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
  participantCount: number
  invitedCount: number
  myStatus: 'INVITED' | 'ACCEPTED' | 'DECLINED' | null
  hasSubmitted: boolean
}

export interface CompetitionsListResponse {
  active: CompetitionSummary[]
  upcoming: CompetitionSummary[]
  completed: CompetitionSummary[]
}

export interface CompetitionLeaderboardEntry {
  rank: number
  userId: number
  name: string
  grossScore: number
  netScore: number | null
  scoreToPar: number
  netScoreToPar: number | null
  courseName: string
  playedAt: string
}

export interface CompetitionParticipant {
  userId: number
  name: string
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED'
}

export interface CompetitionDetail {
  id: string
  name: string
  creator: { id: number; name: string }
  course: { id: number; name: string } | null
  startDate: string
  endDate: string
  scoringType: 'NET' | 'GROSS'
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
  participants: CompetitionParticipant[]
  leaderboard: CompetitionLeaderboardEntry[]
  noSubmission: { userId: number; name: string }[]
  myStatus: 'INVITED' | 'ACCEPTED' | 'DECLINED'
  hasSubmitted: boolean
}

export interface EligibleRound {
  id: number
  courseName: string
  playedAt: string
  totalStrokes: number
  scoreToPar: number
  holesPlayed: number
}

// ── Tee Times ────────────────────────────────────────────────────────────────

export interface TeeTimeParticipant {
  userId: number
  name: string
  status: 'CONFIRMED' | 'INVITED' | 'REQUESTED' | 'DECLINED' | 'WITHDRAWN'
}

export interface TeeTimeSummary {
  id: string
  creatorId: number
  creatorName: string
  course: { id: number; name: string } | null
  courseName: string | null
  dateTime: string
  spotsTotal: number
  spotsFilled: number
  notes: string | null
  visibility: 'FRIENDS' | 'INVITED_ONLY'
  status: 'OPEN' | 'FULL' | 'CANCELLED' | 'COMPLETED'
  participants: TeeTimeParticipant[]
}

export interface TeeTimesListResponse {
  myUpcoming: TeeTimeSummary[]
  invitations: TeeTimeSummary[]
  friendsTeeTimes: TeeTimeSummary[]
}

export interface TeeTimeDetail {
  id: string
  creatorId: number
  creator: { id: number; name: string }
  course: { id: number; name: string } | null
  courseName: string | null
  dateTime: string
  spotsTotal: number
  spotsFilled: number
  notes: string | null
  visibility: 'FRIENDS' | 'INVITED_ONLY'
  status: 'OPEN' | 'FULL' | 'CANCELLED' | 'COMPLETED'
  participants: TeeTimeParticipant[]
  myStatus: 'CONFIRMED' | 'INVITED' | 'REQUESTED' | 'DECLINED' | 'WITHDRAWN' | null
  canJoin: boolean
}

// ── Profiles ─────────────────────────────────────────────────────────────────

export interface ProfileRecentRound {
  roundId: number
  shareId: string | null
  courseName: string
  playedAt: string
  totalStrokes: number
  scoreToPar: number
  holesCompleted: number
}

export interface UserProfile {
  id: number
  name: string
  handicapIndex: number | null
  memberSince: string
  roundsPlayed: number
  averageScoreToPar: number | null
  bestScoreToPar: number | null
  favouriteCourse: string | null
  recentRounds: ProfileRecentRound[]
  achievements: unknown[]
  mutualFriends: number
  isLive: boolean
  liveRoundId: number | null
  liveCourseName: string | null
}

// ── Achievements ─────────────────────────────────────────────────────────────

export type AchievementCategory = 'SCORING' | 'MILESTONE' | 'COURSE'

export interface UnlockedAchievement {
  type: string
  name: string
  description: string
  emoji: string
  category: AchievementCategory
  unlockedAt: string
  courseName: string | null
  metadata: Record<string, unknown> | null
}

export interface LockedAchievement {
  type: string
  name: string
  description: string
  emoji: string
  category: AchievementCategory
}

export interface UserAchievementsResponse {
  unlocked: UnlockedAchievement[]
  locked: LockedAchievement[]
}

export interface RecentAchievement {
  id: string
  userId: number
  userName: string
  type: string
  name: string
  description: string
  emoji: string
  unlockedAt: string
  metadata: Record<string, unknown> | null
}

export interface NewlyUnlockedAchievement {
  id: string
  type: string
  name: string
  description: string
  emoji: string
  category: AchievementCategory
  unlockedAt: string
  metadata: Record<string, unknown> | null
}

export interface SharedCourseH2H {
  courseId: number
  courseName: string
  viewerBest: number
  targetBest: number
  viewerAvg: number
  targetAvg: number
  viewerRounds: number
  targetRounds: number
}

export interface RecentMatchup {
  courseName: string
  viewerScore: number
  targetScore: number
  viewerDate: string
  targetDate: string
  winner: 'viewer' | 'target' | 'draw'
}

export interface HeadToHead {
  totalRoundsCompared: number
  viewerWins: number
  targetWins: number
  draws: number
  sharedCourses: SharedCourseH2H[]
  handicapComparison: {
    viewerCurrent: number | null
    targetCurrent: number | null
    viewerTrend: 'improving' | 'declining' | 'stable' | null
    targetTrend: 'improving' | 'declining' | 'stable' | null
  }
  recentMatchups: RecentMatchup[]
}

// ── Live Rounds ──────────────────────────────────────────────────────────────

export interface LiveRound {
  roundId: number
  shareId: string | null
  playerId: number
  playerName: string
  courseName: string
  holesCompleted: number
  totalHoles: number
  currentScoreToPar: number
  lastScoredAt: string
  currentHoleNumber: number
}

export interface LiveRoundsResponse {
  liveRounds: LiveRound[]
  ownLiveRound: LiveRound | null
}

export interface LiveScorecardHole {
  number: number
  par: number
  distance: number
  strokes: number | null
  scoreToPar: number | null
}

export interface LiveScorecard {
  roundId: number
  shareId: string | null
  playerId: number
  playerName: string
  courseName: string
  holes: LiveScorecardHole[]
  holesCompleted: number
  totalHoles: number
  currentScoreToPar: number
  lastScoredAt: string | null
  completedAt: string | null
  playedAt: string
}
