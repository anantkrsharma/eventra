-- AlterTable
ALTER TABLE "OAuthToken" ADD COLUMN     "userEmail" TEXT;

-- CreateIndex
CREATE INDEX "OAuthToken_userEmail_idx" ON "OAuthToken"("userEmail");
