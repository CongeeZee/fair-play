-- CreateTable
CREATE TABLE "InviteLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "label" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteAcceptance" (
    "id" TEXT NOT NULL,
    "inviteLinkId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteLink_code_key" ON "InviteLink"("code");
CREATE INDEX "InviteLink_creatorId_idx" ON "InviteLink"("creatorId");
CREATE INDEX "InviteLink_creatorId_label_idx" ON "InviteLink"("creatorId", "label");
CREATE UNIQUE INDEX "InviteAcceptance_inviteLinkId_userId_key" ON "InviteAcceptance"("inviteLinkId", "userId");
CREATE INDEX "InviteAcceptance_userId_idx" ON "InviteAcceptance"("userId");

-- AddForeignKey
ALTER TABLE "InviteLink" ADD CONSTRAINT "InviteLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteAcceptance" ADD CONSTRAINT "InviteAcceptance_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "InviteLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteAcceptance" ADD CONSTRAINT "InviteAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
