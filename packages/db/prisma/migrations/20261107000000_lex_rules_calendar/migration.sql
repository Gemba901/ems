-- Area 02.03 only. No employee, account, branch or position records are changed.
CREATE TABLE "LexPerformanceCalendar" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 0,
 "currentVersion" INTEGER NOT NULL DEFAULT 0, "draft" JSONB NOT NULL,
 "revisionReason" TEXT, "returnReason" TEXT, "submittedByUserId" TEXT,
 "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LexPerformanceCalendar_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','APPROVED')),
 CONSTRAINT "LexPerformanceCalendar_counts_check" CHECK ("revision" >= 0 AND "currentVersion" >= 0),
 CONSTRAINT "LexPerformanceCalendar_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexPerformanceCalendar_id_organizationId_key" ON "LexPerformanceCalendar"("id","organizationId");
CREATE INDEX "LexPerformanceCalendar_organizationId_updatedAt_idx" ON "LexPerformanceCalendar"("organizationId","updatedAt");
CREATE TABLE "LexPerformanceCalendarVersion" (
 "id" TEXT PRIMARY KEY, "calendarId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "approvedByUserId" TEXT NOT NULL,
 "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LexPerformanceCalendarVersion_calendarId_organizationId_fkey" FOREIGN KEY ("calendarId","organizationId") REFERENCES "LexPerformanceCalendar"("id","organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexPerformanceCalendarVersion_calendarId_version_key" ON "LexPerformanceCalendarVersion"("calendarId","version");
CREATE INDEX "LexPerformanceCalendarVersion_organizationId_idx" ON "LexPerformanceCalendarVersion"("organizationId");
CREATE TABLE "LexPerformanceCalendarEvent" (
 "id" TEXT PRIMARY KEY, "calendarId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "actorUserId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "reason" TEXT, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LexPerformanceCalendarEvent_calendarId_organizationId_fkey" FOREIGN KEY ("calendarId","organizationId") REFERENCES "LexPerformanceCalendar"("id","organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LexPerformanceCalendarEvent_calendarId_createdAt_idx" ON "LexPerformanceCalendarEvent"("calendarId","createdAt");
CREATE INDEX "LexPerformanceCalendarEvent_organizationId_idx" ON "LexPerformanceCalendarEvent"("organizationId");
