# Fairplay — Golf Score Tracker

A full-stack golf scoring, handicap tracking, and social competition app. Built with React, Express, Prisma, and PostgreSQL (Supabase).

![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?logo=supabase&logoColor=white)

---

## Features

### Scoring & Rounds
- **Course search** — Search thousands of courses worldwide with full hole data (par, distance)
- **Live round scoring** — Hole-by-hole scorecard with strokes, putts, fairways, approach tracking, and greens-in-regulation
- **Score-to-par feedback** — Color-coded chips (eagle, birdie, par, bogey, double+) update in real-time
- **Round history** — Browse past rounds with totals, score-to-par, and detailed scorecards
- **Shareable scorecards** — Share a link to any round with OG meta tags for rich link previews
- **Offline support** — Score holes offline; queued requests sync when connectivity returns

### Handicap
- **WHS handicap calculator** — World Handicap System compliant index from your recent rounds (best 8 of last 20, ×0.96 adjustment)
- **Handicap history chart** — Visualize your handicap trend over time
- **Linked handicap** — Manually link an official handicap index for use in net-scoring competitions

### Social
- **Friends** — Search for users, send/accept friend requests, view friends' rounds and handicaps
- **Activity feed** — See recent rounds from friends with scores and course info
- **Leaderboards** — Best score-to-par and handicap rankings across your friend group

### Competitions
- **Create competitions** — Set a name, optional course restriction, date window, and scoring type (NET or GROSS)
- **Invite friends** — Invite friends to compete; they accept or decline
- **Submit rounds** — Players submit eligible rounds played within the competition window
- **Leaderboard** — Ranked by net or gross score-to-par with automatic handicap adjustment for net scoring
- **Push notifications** — Notified when invited, when someone submits a round, and when the competition ends

### Other
- **Authentication** — Email/password and Google OAuth with JWT access + refresh tokens
- **Email verification** — Verification email sent on registration; banner prompts until verified
- **Onboarding flow** — Guided welcome wizard for new users
- **Push notifications** — Web push via VAPID for friend requests, competition events
- **Rate limiting** — Per-IP rate limits on all endpoints
- **Mobile-first design** — Responsive layout with bottom navigation, safe-area support, and touch-friendly controls
- **Stats dashboard** — Average/best/worst score-to-par, hole breakdown (eagles through doubles+), per-course stats, per-hole stats with GIR/fairway/putt rates, and AI-style insights

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Express 5 | HTTP server and routing |
| Prisma 6 | ORM and database schema |
| PostgreSQL (Supabase) | Database |
| TypeScript | Type safety |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT access and refresh tokens |
| Zod | Request validation |
| web-push | VAPID push notifications |
| google-auth-library | Google OAuth verification |
| express-rate-limit | API rate limiting |
| Resend | Transactional email (verification) |

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + Vite | UI framework and build tool |
| TypeScript | Type safety |
| Material UI v6 | Component library |
| React Router v7 | Client-side routing |
| TanStack React Query | Server state management and caching |
| Axios | HTTP client with interceptors |
| Recharts | Handicap trend charts |
| @react-oauth/google | Google sign-in |

---

## Project Structure

```
golf-app/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts           # Register, login, Google OAuth, refresh tokens, email verification
│   │   │   ├── courses.ts        # Course search, creation, hole data
│   │   │   ├── rounds.ts         # Round CRUD, hole scoring, history, stats, insights, sharing
│   │   │   ├── handicap.ts       # Handicap calculation, history, linked handicaps
│   │   │   ├── friends.ts        # Friend requests, search, leaderboards, feed
│   │   │   ├── competitions.ts   # Competition CRUD, invites, round submission, leaderboard
│   │   │   └── notifications.ts  # Push subscription management
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verification and email-verified guard
│   │   │   └── rateLimiter.ts    # Per-IP rate limiting
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Prisma client singleton
│   │   │   ├── email.ts          # Resend email client
│   │   │   ├── handicap.ts       # WHS handicap calculation logic
│   │   │   └── pushNotification.ts # Web push helper
│   │   ├── prisma/
│   │   │   └── schema.prisma     # Database schema
│   │   ├── tests/                # API integration tests
│   │   ├── app.ts                # Express app setup
│   │   └── index.ts              # Entry point
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── api/                  # Typed API functions (auth, courses, rounds, friends, competitions)
    │   ├── components/           # Navbar, BottomNav, OnboardingFlow, charts, dialogs
    │   ├── contexts/             # AuthContext — user/token state, login/logout/register
    │   ├── hooks/                # useOnlineStatus, usePushNotifications
    │   ├── lib/                  # Offline request queue
    │   ├── pages/                # All page components
    │   │   ├── FeedPage.tsx      # Friend activity feed
    │   │   ├── CoursesPage.tsx   # Course search and round start
    │   │   ├── CompetitionsPage.tsx # Competition list, detail, create wizard
    │   │   ├── RoundPage.tsx     # Live scoring interface
    │   │   ├── HistoryPage.tsx   # Past rounds
    │   │   ├── StatsPage.tsx     # Stats dashboard with insights
    │   │   ├── CourseStatsPage.tsx # Per-course and per-hole stats
    │   │   ├── FriendsPage.tsx   # Friends, requests, search, leaderboards
    │   │   └── ...               # Login, Register, Home, Verify, SharedScorecard
    │   ├── types/                # Shared TypeScript interfaces
    │   ├── theme.ts              # MUI theme (dark green + gold palette)
    │   └── App.tsx               # Routing and layout
    ├── package.json
    └── vite.config.ts            # Vite config with API proxy
```

---

## Database Schema

```
User ──< Round >── Course
  |         |          |
  |         └──< RoundHole >── Hole
  |
  ├──< Friendship
  ├──< PushSubscription
  ├──< LinkedHandicap
  |
  ├──< Competition (creator)
  ├──< CompetitionParticipant
  └──< CompetitionRound

Competition ──< CompetitionParticipant >── User
     |
     └──< CompetitionRound >── Round
```

- A `User` has many `Round`s, `Friendship`s, `LinkedHandicap`s, and `Competition` entries
- A `Round` belongs to a `Course` and has many `RoundHole`s tracking strokes, putts, fairways, etc.
- A `Competition` has participants (invited/accepted/declined) and submitted rounds with gross/net scores
- Par is always sourced from the `Hole` model — never duplicated on `RoundHole`

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create account, sends verification email |
| POST | `/auth/login` | No | Login, returns access + refresh tokens |
| POST | `/auth/google` | No | Google OAuth login/register |
| POST | `/auth/refresh` | No | Refresh access token |
| GET | `/auth/verify-email` | No | Verify email via token link |
| POST | `/auth/resend-verification` | Yes | Resend verification email |
| POST | `/auth/complete-onboarding` | Yes | Mark onboarding as complete |

### Courses
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/courses?search=` | Yes | Search courses by name |
| GET | `/courses/:id` | Yes | Get course with holes |
| POST | `/courses` | Yes | Create a new course |

### Rounds
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/rounds` | Yes | Start a new round |
| PUT | `/rounds/:id/holes/:holeId` | Yes | Submit/update hole score (upsert) |
| GET | `/rounds` | Yes | Round history with totals |
| GET | `/rounds/stats` | Yes | Aggregate stats and insights |
| GET | `/rounds/stats/courses` | Yes | Per-course stats summary |
| GET | `/rounds/stats/courses/:courseId` | Yes | Per-hole stats for a course |
| GET | `/rounds/:id` | Yes | Single round detail |
| POST | `/rounds/:id/share` | Yes | Generate share link |
| GET | `/rounds/shared/:shareId` | No | View shared scorecard |

### Handicap
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/handicap` | Yes | Current handicap index and differentials |
| GET | `/handicap/history` | Yes | Handicap trend over time |
| POST | `/handicap/link` | Yes | Link an official handicap (manual) |
| DELETE | `/handicap/link/:id` | Yes | Remove linked handicap |

### Friends
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/friends` | Yes | List friends |
| GET | `/friends/requests` | Yes | Pending friend requests |
| GET | `/friends/search?q=` | Yes | Search users |
| POST | `/friends/request` | Yes | Send friend request |
| POST | `/friends/respond` | Yes | Accept/decline request |
| DELETE | `/friends/:id` | Yes | Remove friend |
| GET | `/friends/feed` | Yes | Activity feed from friends |
| GET | `/friends/leaderboard` | Yes | Score leaderboard |
| GET | `/friends/leaderboard/handicap` | Yes | Handicap leaderboard |

### Competitions
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/competitions` | Yes | List competitions (active/upcoming/completed) |
| GET | `/competitions/:id` | Yes | Competition detail with leaderboard |
| POST | `/competitions` | Yes | Create competition |
| POST | `/competitions/:id/invite` | Yes | Invite friends (creator only) |
| POST | `/competitions/:id/respond` | Yes | Accept/decline invitation |
| POST | `/competitions/:id/submit-round` | Yes | Submit a round to the competition |
| GET | `/competitions/:id/eligible-rounds` | Yes | Rounds eligible for submission |
| DELETE | `/competitions/:id` | Yes | Delete competition (creator, upcoming only) |

### Notifications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/notifications/subscribe` | Yes | Register push subscription |
| DELETE | `/notifications/subscribe` | Yes | Remove push subscription |

---

## Handicap Calculation

Handicap index is calculated using the **World Handicap System (WHS)** formula:

1. A **Score Differential** is calculated for each 18-hole round:
   ```
   Score Differential = (Adjusted Gross Score − Course Rating) × (113 / Slope Rating)
   ```
2. The best 8 differentials from the last 20 rounds are averaged
3. A **0.96 adjustment** is applied to the average

For **net scoring** in competitions:
```
Course Handicap = round(Handicap Index × Slope Rating / 113)
Net Score = Gross Score − Course Handicap
```

---

## Key Design Decisions

**Express 5 params**: Express 5 types params as `string | string[]` — all route handlers use `String()` cast for safety.

**`RoundHole` join model**: Par is always read from the `Hole` record, so updating a course's hole configuration doesn't corrupt historical score-to-par calculations.

**Upsert on hole scoring**: `PUT /rounds/:id/holes/:holeId` upserts rather than errors on duplicate submissions, so a player can correct a score mid-round.

**Competition status from dates**: Competition status (UPCOMING/ACTIVE/COMPLETED) is derived from `startDate`/`endDate` at query time rather than stored as a mutable field.

**Offline queue**: Round scoring requests that fail due to network errors are queued in IndexedDB and replayed when connectivity returns, so scoring works on the course with spotty signal.

**JWT refresh tokens**: Short-lived access tokens (15 min) with long-lived refresh tokens stored in the database. Silent refresh via Axios interceptor.

**Supabase pooler connection**: Direct connections on port 5432 are blocked on most networks. The transaction pooler (port 6543) is used for the app; migrations are applied via the Supabase SQL editor.

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Supabase project)

### Backend
```bash
cd backend
npm install
cp .env.example .env  # configure DATABASE_URL, JWT_SECRET, etc.
npx prisma generate
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:3001`.

---

## License

MIT
