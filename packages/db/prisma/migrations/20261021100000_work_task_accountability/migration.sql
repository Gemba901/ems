CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
ALTER TABLE "WorkTask" ADD COLUMN "priority" "WorkTaskPriority" NOT NULL DEFAULT 'MEDIUM', ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "WorkTaskActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkTaskActivity_taskId_createdAt_id_idx" ON "WorkTaskActivity"("taskId", "createdAt", "id");
