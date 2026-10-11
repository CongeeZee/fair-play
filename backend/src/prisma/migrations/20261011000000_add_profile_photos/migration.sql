-- Profile photos: one small resized image per user, served with a versioned URL.
CREATE TABLE "ProfilePhoto" (
    "userId" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same posture as every other table: RLS on, no policies, no PostgREST grants.
ALTER TABLE "ProfilePhoto" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProfilePhoto" FROM anon, authenticated;
