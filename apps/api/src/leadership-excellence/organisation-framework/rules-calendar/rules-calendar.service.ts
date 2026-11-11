import {
  CALENDAR_PEOPLE_SOURCE,
  CoreCalendarPeopleSource,
  type CalendarPeopleSource,
} from "./calendar-people.source";
import {
  audienceIssue,
  audienceLabel,
  emptyAudience,
} from "./calendar-audience";
import {
  assignmentConflicts,
  audienceMatches,
  compareCalendars,
  currentAssignment,
  validateAudienceReferences,
  type PublishedCalendar,
} from "./calendar-assignments";
import { validDate } from "./calendar-engine";
import { cycleDateIssue } from "./cycle-dates";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
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
  reviewPeriods,
  reviewWarnings,
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
  | "revise"
  | "delete"
  | "discard-revision";
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CALENDAR_PEOPLE_SOURCE)
    private readonly people: CalendarPeopleSource = new CoreCalendarPeopleSource(),
  ) {}

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
            updatedAt: true,
            draft: true,
          },
        });
        if (capabilities.edit)
          return rows.map(({ draft, ...row }) => {
            const rules = draft as unknown as CalendarRules;
            return {
              ...row,
              start: rules.start,
              end: rules.end,
              audienceLabel: audienceLabel(rules.audience),
              audienceKind: rules.audience?.kind ?? "UNASSIGNED",
            };
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
              audienceLabel: audienceLabel(
                (v?.snapshot as unknown as ApprovedCalendarSnapshot)?.rules
                  .audience,
              ),
              audienceKind:
                (v?.snapshot as unknown as ApprovedCalendarSnapshot)?.rules
                  .audience?.kind ?? "UNASSIGNED",
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
      assignmentModes: ["COMPANY", "DEPARTMENTS", "PEOPLE"],
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
      await this.checkAudienceReferences(tx, organizationId, draft);
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
      // Serialize publication per company. Different calendar rows can otherwise
      // both pass an overlap check and publish conflicting assignments.
      if (action === "approve")
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"lex-calendar-audience:" + organizationId}, 0))`;
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
      if (action === "delete") {
        this.state(row, "DRAFT");
        if (row.currentVersion > 0)
          throw new ConflictException(
            "This calendar has an approved version. Discard its draft revision instead.",
          );
        const deleted = await tx.lexPerformanceCalendar.deleteMany({
          where: {
            id,
            organizationId,
            status: "DRAFT",
            currentVersion: 0,
            revision: expected,
            versions: { none: {} },
          },
        });
        if (deleted.count !== 1)
          throw new ConflictException(
            "The draft changed. Reload it before deleting.",
          );
        return { id, deleted: true };
      }
      let draft =
        action === "discard-revision"
          ? (row.draft as unknown as CalendarRules)
          : parseRules(row.draft);
      let snapshot: ApprovedCalendarSnapshot | null = null;
      if (action === "discard-revision") {
        this.state(row, "DRAFT");
        if (!row.currentVersion)
          throw new ConflictException(
            "This calendar has no approved version. Delete the draft instead.",
          );
        const approved = await tx.lexPerformanceCalendarVersion.findFirst({
          where: {
            calendarId: id,
            organizationId,
            version: row.currentVersion,
          },
        });
        if (!approved)
          throw new ConflictException(
            "The approved version is unavailable. Nothing was discarded.",
          );
        draft = structuredClone(
          (approved.snapshot as unknown as ApprovedCalendarSnapshot).rules,
        );
        data.draft = json(draft);
        data.name = draft.name;
        data.status = "APPROVED";
        data.revisionReason = null;
        data.returnReason = null;
        data.submittedByUserId = null;
      } else if (action === "save") {
        this.state(row, "DRAFT");
        draft = parseRules(body.rules);
        const dateIssue = cycleDateIssue(draft.start, draft.end, true);
        if (dateIssue) throw new BadRequestException(dateIssue);
        await this.checkAudienceReferences(tx, organizationId, draft);
        data.draft = json(draft);
        data.name = draft.name || "Untitled cycle";
      } else if (action === "submit" || action === "approve") {
        if (action === "submit") this.state(row, "DRAFT");
        else if (!["DRAFT", "IN_REVIEW"].includes(row.status))
          throw new ConflictException(
            "Only a draft or a submitted calendar can be approved.",
          );
        await this.checkAudienceReferences(tx, organizationId, draft);
        if (draft.audience && draft.audience.kind !== "UNASSIGNED") {
          const conflicts = assignmentConflicts(
            draft,
            id,
            await this.published(tx, organizationId),
          );
          if (conflicts.length)
            throw new ConflictException(
              `Calendar assignment overlaps ${conflicts.map((c) => `“${c.name}” v${c.version}`).join(", ")}. Change the people/departments or dates, or revise that calendar. No approval was published.`,
            );
        }
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

  private async checkAudienceReferences(
    tx: Prisma.TransactionClient,
    organizationId: string,
    rules: CalendarRules,
  ) {
    if (
      !rules.audience ||
      ["UNASSIGNED", "COMPANY"].includes(rules.audience.kind)
    )
      return;
    const issues = validateAudienceReferences(
      rules.audience,
      await this.people.read(tx, organizationId),
    );
    if (issues.length) throw new BadRequestException(issues);
  }

  private async published(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<PublishedCalendar[]> {
    const rows = await tx.lexPerformanceCalendar.findMany({
      where: { organizationId, currentVersion: { gt: 0 } },
      take: 1001,
      select: {
        id: true,
        currentVersion: true,
        versions: {
          where: { organizationId },
          orderBy: { version: "desc" },
          take: 1,
          select: { version: true, snapshot: true },
        },
      },
    });
    if (rows.length > 1000)
      throw new BadRequestException(
        "This company has more than 1,000 approved calendars. The assignment directory needs pagination before continuing.",
      );
    return rows.map((row) => {
      const v = row.versions[0];
      if (!v || v.version !== row.currentVersion)
        throw new ConflictException(
          "An approved calendar version is missing. Restore that version before comparing or publishing assignments.",
        );
      return {
        id: row.id,
        version: v.version,
        rules: (v.snapshot as unknown as ApprovedCalendarSnapshot).rules,
      };
    });
  }

  async directory(organizationId: string, actor: CalendarActor) {
    this.access(actor, "edit");
    return tenantTransaction(this.prisma, organizationId, (tx) =>
      this.people.read(tx, organizationId),
    );
  }

  async assignmentPreview(
    organizationId: string,
    actor: CalendarActor,
    value: unknown,
    currentId?: string,
  ) {
    this.access(actor, "edit");
    const rules = parseRules(value);
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      if (
        currentId &&
        !(await tx.lexPerformanceCalendar.findFirst({
          where: { organizationId, id: currentId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Calendar not found.");
      const directory = await this.people.read(tx, organizationId);
      const matching = directory.people.filter((p) =>
        audienceMatches(rules.audience, p),
      );
      const issues = [
        audienceIssue(rules.audience),
        cycleDateIssue(rules.start, rules.end),
        ...validateAudienceReferences(rules.audience, directory),
      ].filter(Boolean);
      return {
        label: audienceLabel(rules.audience),
        matchingActive: matching.filter((p) => p.active).length,
        inactiveMembers: matching.filter((p) => !p.active).length,
        issues,
        conflicts: assignmentConflicts(
          rules,
          currentId,
          await this.published(tx, organizationId),
        ),
      };
    });
  }

  async comparison(
    organizationId: string,
    actor: CalendarActor,
    month: string,
  ) {
    this.access(actor, "read");
    if (
      !/^\d{4}-\d{2}$/.test(month) ||
      !validDate(`${month}-01`) ||
      month < "1900-01" ||
      month > "2199-12"
    )
      throw new BadRequestException(
        "Choose a valid comparison month between 1900 and 2199.",
      );
    const data = await tenantTransaction(
      this.prisma,
      organizationId,
      async (tx) => ({
        directory: await this.people.read(tx, organizationId),
        calendars: await this.published(tx, organizationId),
      }),
    );
    const relevant = data.calendars.filter(
      (c) =>
        c.rules.start.slice(0, 7) <= month && c.rules.end.slice(0, 7) >= month,
    );
    if (relevant.length > 200)
      throw new BadRequestException(
        "More than 200 calendars cover this month. A filtered comparison is required; no partial comparison is shown.",
      );
    return compareCalendars(month, data.directory, relevant);
  }

  /** Draft contract for Area 03: current directory matching, not historical employment reconstruction.
   * The consumer must confirm and pin calendarId + version. Existing plans never call this to silently rebind. */
  async getCurrentAssignment(
    organizationId: string,
    employeeId: string,
    localDate: string,
  ) {
    if (!validDate(localDate))
      throw new BadRequestException("Choose a valid assignment date.");
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const directory = await this.people.read(tx, organizationId);
      const person = directory.people.find((p) => p.id === employeeId);
      if (!person)
        throw new NotFoundException("Employee not found in this company.");
      return currentAssignment(
        person,
        localDate,
        await this.published(tx, organizationId),
      );
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
      const periods = makePeriods(rules, frequency);
      const reviews = reviewPeriods(rules);
      return {
        periods,
        reviews,
        warnings: reviewWarnings(rules, { [frequency]: periods }, reviews),
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
