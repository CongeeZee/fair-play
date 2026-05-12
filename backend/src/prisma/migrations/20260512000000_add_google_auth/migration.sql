-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
