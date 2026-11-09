import { cycleDateIssue } from "./cycle-dates";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, LexPerformanceCalendar } from "db";
import { PrismaService } from "src/prisma/prisma.service";
import { tenantTransaction } from "src/prisma/tenant-transaction";
import { Role } from "src/common/enum/role.enum";
import { LEX_APPROVERS, LEX_ALL } from "../../common/lex-roles";
import {
  approvalSnapshot,
  calendarErrors,
  makePeriods,
} from "./calendar-engine";
import {
  CalendarRules,
  ApprovedCalendarSnapshot,
  ApprovedPerformanceCalendar,
  Frequency,
} from "./calendar-model";
import {
  object,
  parseRules,
  reasonText,
  revisionNumber,
} from "./calendar-validation";

export type CalendarActor = { userId: string; role: Role };
export type CalendarAction =
  | "save"
  | "submit"
  | "approve"
  | "return"
  | "withdraw"
  | "revise";
const json = (value: unknown) => value as Prisma.InputJsonValue;

export function calendarCapabilities(role: Role) {
  const approve = LEX_APPROVERS.includes(role);
  // HOD is an Area 03 scoped editor, not a company-calendar administrator.
  return {
    read: LEX_ALL.includes(role),
    edit: approve || role === Role.HR,
    approve,
  };
}

@Injectable()
export class RulesCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private access(
    actor: CalendarActor,
    permission: "read" | "edit" | "approve",
  ) {
    if (!actor.userId || !calendarCapabilities(actor.role)[permission])
      throw new ForbiddenException(
        "You do not have permission for this calendar action.",
      );
  }

  async list(organizationId: string, actor: CalendarActor) {
    this.access(actor, "read");
    const capabilities = calendarCapabilities(actor.role);
    const calendars = await tenantTransaction(
      this.prisma,
      organizationId,
      async (tx) => {
        const rows = await tx.lexPerformanceCalendar.findMany({
          where: {
            organizationId,
            ...(capabilities.edit ? {} : { currentVersion: { gt: 0 } }),
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: {
            id: true,
            name: true,
            status: true,
            currentVersion: true,
            revision: true,
            draft: true,
          },
        });
        if (capabilities.edit)
          return rows.map(({ draft, ...row }) => {
            const rules = draft as unknown as CalendarRules;
            return { ...row, start: rules.start, end: rules.end };
          });
        // Even the cycle name may have been edited in an unpublished revision.
        return Promise.all(
          rows.map(async (r) => {
            const v = await tx.lexPerformanceCalendarVersion.findFirst({
              where: {
                organizationId,
                calendarId: r.id,
                version: r.currentVersion,
              },
            });
            return {
              id: r.id,
              name:
                (v?.snapshot as unknown as ApprovedCalendarSnapshot)?.rules
                  .name ?? "Approved cycle",
              start: (v?.snapshot as unknown as ApprovedCalendarSnapshot)?.rules
                .start,
              end: (v?.snapshot as unknown as ApprovedCalendarSnapshot)?.rules
                .end,
              status: "APPROVED",
              currentVersion: r.currentVersion,
            };
          }),
        );
      },
    );
    return {
      calendars,
      capabilities,
      scope: "COMPANY",
      branchCalendarsAvailable: false,
    };
  }

  async read(organizationId: string, id: string, actor: CalendarActor) {
    this.access(actor, "read");
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const row = await tx.lexPerformanceCalendar.findFirst({
        where: { id, organizationId },
      });
      if (!row) throw new NotFoundException("Calendar not found.");
      const approved = row.currentVersion
        ? await tx.lexPerformanceCalendarVersion.findFirst({
            where: {
              calendarId: id,
              organizationId,
              version: row.currentVersion,
            },
          })
        : null;
      const versions = await tx.lexPerformanceCalendarVersion.findMany({
        where: { calendarId: id, organizationId },
        orderBy: { version: "desc" },
        select: { version: true, approvedAt: true },
      });
      const published = approved
        ? {
            version: approved.version,
            approvedAt: approved.approvedAt.toISOString(),
            snapshot: approved.snapshot,
          }
        : null;
      if (!calendarCapabilities(actor.role).edit) {
        if (!published)
          throw new NotFoundException("No approved calendar is available.");
        return { id, status: "APPROVED", approved: published, versions };
      }
      return {
        id,
        status: row.status,
        revision: row.revision,
        draft: row.draft,
        revisionReason: row.revisionReason,
        returnReason: row.returnReason,
        submittedByUserId: row.submittedByUserId,
        updatedAt: row.updatedAt.toISOString(),
        approved: published,
        versions,
      };
    });
  }

  async create(organizationId: string, actor: CalendarActor, value: unknown) {
    this.access(actor, "edit");
    const draft = parseRules(value);
    const dateIssue = cycleDateIssue(draft.start, draft.end, true);
    if (dateIssue) throw new BadRequestException(dateIssue);
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const row = await tx.lexPerformanceCalendar.create({
        data: {
          organizationId,
          name: draft.name || "Untitled cycle",
          draft: json(draft),
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
      await tx.lexPerformanceCalendarEvent.create({
        data: {
          organizationId,
          calendarId: row.id,
          action: "CREATED",
          actorUserId: actor.userId,
          revision: 0,
          snapshot: json(draft),
        },
      });
      return { id: row.id, revision: row.revision };
    });
  }

  async mutate(
    organizationId: string,
    id: string,
    actor: CalendarActor,
    action: CalendarAction,
    input: unknown,
  ) {
    this.access(
      actor,
      action === "approve" || action === "return" ? "approve" : "edit",
    );
    const body = object(input),
      expected = revisionNumber(body.expectedRevision),
      reason = reasonText(body.reason);
    if ((action === "return" || action === "revise") && !reason)
      throw new BadRequestException("Give a reason for this change.");
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const row = await tx.lexPerformanceCalendar.findFirst({
        where: { id, organizationId },
      });
      if (!row) throw new NotFoundException("Calendar not found.");
      if (row.revision !== expected)
        throw new ConflictException(
          "This calendar changed in another tab. Reload the saved version before trying again. Your unsaved changes have not been applied.",
        );
      const data: Prisma.LexPerformanceCalendarUpdateManyMutationInput = {
        revision: { increment: 1 },
        updatedByUserId: actor.userId,
      };
      let draft = parseRules(row.draft);
      let snapshot: ApprovedCalendarSnapshot | null = null;
      if (action === "save") {
        this.state(row, "DRAFT");
        draft = parseRules(body.rules);
        const dateIssue = cycleDateIssue(draft.start, draft.end, true);
        if (dateIssue) throw new BadRequestException(dateIssue);
        data.draft = json(draft);
        data.name = draft.name || "Untitled cycle";
      } else if (action === "submit" || action === "approve") {
        if (action === "submit") this.state(row, "DRAFT");
        else if (!["DRAFT", "IN_REVIEW"].includes(row.status))
          throw new ConflictException(
            "Only a draft or a submitted calendar can be approved.",
          );
        const errors = calendarErrors(draft);
        if (errors.length) throw new BadRequestException(errors);
        try {
          snapshot = approvalSnapshot(draft);
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : "Unable to generate the calendar.",
          );
        }
        if (action === "submit") {
          data.status = "IN_REVIEW";
          data.submittedByUserId = actor.userId;
          data.returnReason = null;
        } else {
          data.status = "APPROVED";
          data.currentVersion = row.currentVersion + 1;
          data.submittedByUserId = null;
          data.returnReason = null;
        }
      } else if (action === "return" || action === "withdraw") {
        this.state(row, "IN_REVIEW");
        if (
          action === "withdraw" &&
          row.submittedByUserId !== actor.userId &&
          !calendarCapabilities(actor.role).approve
        )
          throw new ForbiddenException(
            "Only the submitter or management can withdraw this draft.",
          );
        data.status = "DRAFT";
        data.submittedByUserId = null;
        if (action === "return") data.returnReason = reason;
      } else if (action === "revise") {
        this.state(row, "APPROVED");
        data.status = "DRAFT";
        data.revisionReason = reason;
        data.returnReason = null;
      } else throw new BadRequestException("Unknown calendar action.");
      // Compare-and-swap prevents a stale save, double approval or concurrent
      // workflow action. Version insertion and audit are in this same transaction.
      const changed = await tx.lexPerformanceCalendar.updateMany({
        where: { id, organizationId, revision: expected },
        data,
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Another action changed this calendar. Reload before continuing.",
        );
      if (action === "approve" && snapshot)
        await tx.lexPerformanceCalendarVersion.create({
          data: {
            organizationId,
            calendarId: id,
            version: row.currentVersion + 1,
            snapshot: json(snapshot),
            approvedByUserId: actor.userId,
          },
        });
      await tx.lexPerformanceCalendarEvent.create({
        data: {
          organizationId,
          calendarId: id,
          action: action.toUpperCase(),
          actorUserId: actor.userId,
          revision: expected + 1,
          reason: reason || null,
          snapshot: json(draft),
        },
      });
      return { id, revision: expected + 1 };
    });
  }

  private state(row: LexPerformanceCalendar, expected: string) {
    if (row.status !== expected)
      throw new ConflictException(
        `This action requires a ${expected.toLowerCase().replace("_", " ")} calendar.`,
      );
  }

  preview(value: unknown, frequency: Frequency) {
    const rules = parseRules(value);
    try {
      return {
        periods: makePeriods(rules, frequency),
        reviews: makePeriods(rules, rules.reviewFrequency).map((p) => ({
          start: p.start,
          end: p.end,
          completeBy: p.scheduled
            ? new Date(
                Date.parse(`${p.end}T00:00:00Z`) + rules.reviewDays * 86400000,
              )
                .toISOString()
                .slice(0, 10)
            : null,
        })),
      };
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Unable to preview the calendar.",
      );
    }
  }

  async history(organizationId: string, id: string, actor: CalendarActor) {
    this.access(actor, "edit");
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      if (
        !(await tx.lexPerformanceCalendar.findFirst({
          where: { id, organizationId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Calendar not found.");
      return tx.lexPerformanceCalendarEvent.findMany({
        where: { organizationId, calendarId: id },
        orderBy: [{ revision: "desc" }],
        take: 100,
      });
    });
  }

  /** Cross-area contract: approved snapshots only. Pin calendarId AND version
   * on a plan. Never silently substitute the latest version for a missing one. */
  async getApproved(
    organizationId: string,
    calendarId: string,
    version?: number,
  ): Promise<ApprovedPerformanceCalendar | null> {
    if (version !== undefined && (!Number.isInteger(version) || version < 1))
      throw new BadRequestException("Choose an approved version.");
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const calendar = await tx.lexPerformanceCalendar.findFirst({
        where: { id: calendarId, organizationId },
        select: { currentVersion: true },
      });
      if (!calendar?.currentVersion) return null;
      const row = await tx.lexPerformanceCalendarVersion.findFirst({
        where: {
          organizationId,
          calendarId,
          version: version ?? calendar.currentVersion,
        },
      });
      if (!row) return null;
      return {
        ...(row.snapshot as unknown as ApprovedCalendarSnapshot),
        calendarId,
        organizationId,
        version: row.version,
        approvedAt: row.approvedAt.toISOString(),
        approvedByUserId: row.approvedByUserId,
      };
    });
  }
}
