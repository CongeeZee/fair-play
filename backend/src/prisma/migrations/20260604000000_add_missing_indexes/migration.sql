-- Add indexes for foreign keys that are queried on their own but were only
-- covered as the *second* column of a composite unique (or not at all), which
-- Postgres cannot use for single-column lookups.

-- Feed + per-round comment fetches filter by roundId; previously no index.
CREATE INDEX "RoundComment_roundId_idx" ON "RoundComment"("roundId");

-- Friend-graph lookups run on nearly every authenticated request via
-- OR(requesterId, addresseeId). requesterId is the prefix of the existing
-- unique, but addresseeId was unindexed.
CREATE INDEX "Friendship_addresseeId_idx" ON "Friendship"("addresseeId");

-- "My tee times" filters by userId alone; the [teeTimeId, userId] unique can't
-- serve it.
CREATE INDEX "TeeTimeParticipant_userId_idx" ON "TeeTimeParticipant"("userId");
