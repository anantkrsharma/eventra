-- AlterTable
ALTER TABLE "public"."OAuthToken" ADD COLUMN     "userEmail" TEXT;

-- CreateIndex
CREATE INDEX "OAuthToken_userEmail_idx" ON "public"."OAuthToken"("userEmail");
