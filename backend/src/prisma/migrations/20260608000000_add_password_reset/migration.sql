-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");
