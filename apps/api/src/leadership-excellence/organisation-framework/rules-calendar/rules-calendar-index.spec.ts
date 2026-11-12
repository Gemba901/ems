import { RulesCalendarService } from "./rules-calendar.service";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "src/common/enum/role.enum";
import { initialRules } from "./calendar-model";

describe("calendar overview summaries", () => {
  function setup() {
    const draft = { ...initialRules(2029), name: "Private revision" };
    const published = { ...initialRules(2028), name: "Approved year" };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      lexPerformanceCalendar: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cycle",
            name: draft.name,
            status: "DRAFT",
            currentVersion: 1,
            revision: 4,
            updatedAt: new Date("2027-02-03T04:05:00Z"),
            draft,
          },
        ]),
      },
      lexPerformanceCalendarVersion: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ snapshot: { rules: published } }),
      },
    };
    const db = { $transaction: jest.fn(async (work) => work(tx)) };
    return {
      tx,
      draft,
      published,
      service: new RulesCalendarService(db as unknown as PrismaService),
    };
  }
  it("gives editors draft dates without serializing the full draft into the list", async () => {
    const { tx, draft, service } = setup();
    const result = await service.list("org-a", { userId: "hr", role: Role.HR });
    expect(result.calendars[0]).toMatchObject({
      name: draft.name,
      start: draft.start,
      end: draft.end,
      status: "DRAFT",
      updatedAt: new Date("2027-02-03T04:05:00Z"),
    });
    expect(result.calendars[0]).not.toHaveProperty("draft");
    expect(tx.lexPerformanceCalendar.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
    });
  });
  it.each([Role.EMPLOYEE, Role.HOD])(
    "keeps unpublished dates and names out of a %s overview",
    async (role) => {
      const { tx, published, service } = setup();
      const result = await service.list("org-a", { userId: "reader", role });
      expect(result.calendars[0]).toEqual({
        id: "cycle",
        audienceKind: "UNASSIGNED",
        audienceLabel: "Choose separately for each plan",
        name: published.name,
        start: published.start,
        end: published.end,
        status: "APPROVED",
        currentVersion: 1,
      });
      expect(JSON.stringify(result)).not.toContain("Private revision");
      expect(tx.lexPerformanceCalendar.findMany.mock.calls[0][0].where).toEqual(
        { organizationId: "org-a", currentVersion: { gt: 0 } },
      );
      expect(tx.lexPerformanceCalendarVersion.findFirst).toHaveBeenCalledWith({
        where: { organizationId: "org-a", calendarId: "cycle", version: 1 },
      });
    },
  );
});
