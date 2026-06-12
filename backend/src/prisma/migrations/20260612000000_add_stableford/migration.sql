-- Stableford scoring support
-- 1. New competition scoring type
ALTER TYPE "ScoringType" ADD VALUE 'STABLEFORD';

-- 2. Official stroke index on holes (1 = hardest). Nullable: imported courses
--    rarely include it; the backend falls back to a distance-based allocation.
ALTER TABLE "Hole" ADD COLUMN "strokeIndex" INTEGER;

-- 3. Total Stableford points for submitted competition rounds.
ALTER TABLE "CompetitionRound" ADD COLUMN "stablefordPoints" INTEGER;
