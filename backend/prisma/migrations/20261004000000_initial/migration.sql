CREATE TYPE "QuizStatus" AS ENUM ('STARTED', 'COMPLETED', 'ABANDONED');
CREATE TABLE "QuizSession" (
  "id" SERIAL NOT NULL,
  "uuid" UUID NOT NULL,
  "editTokenHash" TEXT NOT NULL,
  "quizVersion" TEXT NOT NULL DEFAULT 'v1',
  "status" "QuizStatus" NOT NULL DEFAULT 'STARTED',
  "currentQuestion" INTEGER NOT NULL DEFAULT 1,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "economicScore" DOUBLE PRECISION,
  "authorityScore" DOUBLE PRECISION,
  "economicLabel" TEXT,
  "authorityLabel" TEXT,
  "politicalLabel" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "shared" BOOLEAN NOT NULL DEFAULT false,
  "sharedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizSession_question_range" CHECK ("currentQuestion" BETWEEN 1 AND 40),
  CONSTRAINT "QuizSession_score_range" CHECK (("economicScore" IS NULL OR "economicScore" BETWEEN -100 AND 100) AND ("authorityScore" IS NULL OR "authorityScore" BETWEEN -100 AND 100)),
  CONSTRAINT "QuizSession_completion" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL)),
  CONSTRAINT "QuizSession_share" CHECK (("shared" = false AND "sharedAt" IS NULL) OR ("shared" = true AND "sharedAt" IS NOT NULL AND "status" = 'COMPLETED'))
);
CREATE UNIQUE INDEX "QuizSession_uuid_key" ON "QuizSession"("uuid");
CREATE INDEX "QuizSession_status_lastActivityAt_idx" ON "QuizSession"("status", "lastActivityAt");
CREATE INDEX "QuizSession_startedAt_id_idx" ON "QuizSession"("startedAt", "id");
CREATE INDEX "QuizSession_status_economicScore_idx" ON "QuizSession"("status", "economicScore");
CREATE INDEX "QuizSession_status_authorityScore_idx" ON "QuizSession"("status", "authorityScore");
CREATE INDEX "QuizSession_shared_idx" ON "QuizSession"("shared");
CREATE TABLE "AdminSession" (
  "id" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
