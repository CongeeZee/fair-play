# Fairway — Golf Score Tracker

A full-stack golf scoring and handicap tracking web application. Built with React, Express, Prisma, and PostgreSQL.

![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?logo=supabase&logoColor=white)

---

## Features

- **Authentication** — Email/password registration and login with JWT
- **Course search** — Search and browse golf courses by name
- **Round scoring** — Hole-by-hole scorecard with live score-to-par feedback
- **Round history** — Full history of past rounds with totals and scores
- **Stats dashboard** — Average score to par, best/worst rounds, hole breakdown (eagles, birdies, pars, bogeys)
- **Handicap calculator** — World Handicap System (WHS) compliant handicap index calculated from your recent rounds

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Express 5 | HTTP server and routing |
| Prisma | ORM and database migrations |
| PostgreSQL (Supabase) | Database |
| TypeScript | Type safety |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT auth |
| Zod | Request validation |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework and build tool |
| TypeScript | Type safety |
| Material UI | Component library |
| React Router v6 | Client-side routing |
| React Query | Server state management |
| Axios | HTTP client |

---

## Project Structure

```
golf-app/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts        # Register, login
│   │   │   ├── courses.ts     # Course search and creation
│   │   │   └── rounds.ts      # Round creation, scoring, history, stats
│   │   ├── middleware/
│   │   │   └── auth.ts        # JWT verification middleware
│   │   ├── lib/
│   │   │   └── prisma.ts      # Prisma client singleton
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # Database schema
│   │   │   └── migrations/    # SQL migration files
│   │   ├── app.ts             # Express app setup
│   │   └── index.ts           # Entry point
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── api/               # Typed API functions (auth, courses, rounds)
    │   ├── components/        # Shared components (Navbar, ProtectedRoute)
    │   ├── contexts/          # AuthContext — user/token state
    │   ├── pages/             # LoginPage, RegisterPage, CoursesPage, etc.
    │   ├── types/             # Shared TypeScript interfaces
    │   ├── theme.ts           # MUI theme
    │   └── App.tsx            # Routing
    ├── package.json
    └── vite.config.ts
```

---

## Database Schema

```
User ──< Round >── Course
              |
              └──< RoundHole >── Hole
```

- A `User` has many `Round`s
- A `Round` belongs to a `Course` and has many `RoundHole`s
- A `RoundHole` joins a round's score to a specific `Hole`, storing strokes
- Par is always sourced from the `Hole` model — never duplicated on `RoundHole`

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Login, returns JWT |

### Courses
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/courses?search=` | No | Search courses (max 50) |
| GET | `/courses/:id` | No | Get course with holes |
| POST | `/courses` | Yes | Create a new course |

### Rounds
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/rounds` | Yes | Start a new round |
| PUT | `/rounds/:id/holes/:holeId` | Yes | Submit/update hole score |
| GET | `/rounds` | Yes | Round history with totals |
| GET | `/rounds/stats` | Yes | Aggregate stats |
| GET | `/rounds/:id` | Yes | Single round detail |

---

## Handicap Calculation

Handicap index is calculated using the **World Handicap System (WHS)** formula:

1. A **Score Differential** is calculated for each round:
   ```
   Score Differential = (Adjusted Gross Score − Course Rating) × (113 / Slope Rating)
   ```
2. The best 8 differentials from the last 20 rounds are averaged
3. A **0.96 adjustment** is applied to the average

This matches the official WHS specification used by golf associations worldwide.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/golf-app.git
cd golf-app
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL="postgresql://postgres.[ref]:[password]@[host]:6543/postgres"
JWT_SECRET="your-long-random-secret"
PORT=3001
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run the database migration via the **Supabase SQL Editor** (paste the contents of `backend/src/prisma/migrations/`), then generate the Prisma client:

```bash
npx prisma generate
npm run dev
```

### 3. Set up the frontend

```bash
cd ../frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to `http://localhost:3001` automatically.

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `DATABASE_URL` | `backend/.env` | Supabase pooler connection string (port 6543) |
| `JWT_SECRET` | `backend/.env` | Secret for signing JWTs — generate randomly |
| `PORT` | `backend/.env` | Backend port (default: 3001) |

---

## Key Design Decisions

**`bcryptjs` over `bcrypt`** — Pure JavaScript implementation avoids native addon compilation issues across environments.

**Supabase pooler connection (port 6543)** — Direct connections on port 5432 are blocked on most networks. The transaction pooler is used for the app; migrations are applied manually via the Supabase SQL editor.

**`RoundHole` join model** — Avoids duplicating par data. Par is always read from the `Hole` record, so updating a course's hole configuration doesn't silently corrupt historical score-to-par calculations.

**Upsert on hole scoring** — `PUT /rounds/:id/holes/:holeId` upserts rather than errors on duplicate submissions, so a player can correct a score without any special delete flow.

**`/rounds/stats` route ordering** — Defined before `/:id` in Express to prevent the string `"stats"` being parsed as a round ID.

**JWT expiry** — Tokens expire after 7 days. Suitable for an MVP; production would use short-lived access tokens with refresh tokens.

---

## License

MIT
