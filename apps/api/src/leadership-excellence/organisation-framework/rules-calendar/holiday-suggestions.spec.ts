import { holidaySuggestions } from "./holiday-suggestions";

describe("holiday suggestions for calendar setup", () => {
  it("offers original Sunday as an optional closure alongside the observed public holiday", () => {
    const { suggestions } = holidaySuggestions("KE", 2027);
    expect(suggestions.find((h) => h.date === "2027-10-10")).toMatchObject({
      category: "OPTIONAL_CLOSURE",
      reason: expect.stringContaining("optional company closure"),
      note: expect.stringContaining("not declare a second public holiday"),
    });
    expect(suggestions.find((h) => h.date === "2027-10-11")).toMatchObject({
      originalDate: "2027-10-10",
      category: "OBSERVED_PUBLIC_HOLIDAY",
      reason: expect.stringContaining("Mazingira Day"),
      note: expect.stringContaining("Sun"),
    });
    expect(suggestions.some((h) => /Moi Day/.test(h.reason))).toBe(false);
  });
  it("does not move Saturday holidays to Monday", () => {
    const { suggestions } = holidaySuggestions("KE", 2026);
    expect(suggestions.find((h) => h.date === "2026-10-10")?.reason).toBe(
      "Mazingira Day",
    );
    expect(suggestions.some((h) => h.date === "2026-10-12")).toBe(false);
    expect(suggestions.find((h) => h.date === "2026-10-10")?.category).toBe(
      "PUBLIC_HOLIDAY",
    );
  });
  it("skips another public holiday when finding the Sunday substitute", () => {
    const { suggestions } = holidaySuggestions("KE", 2033);
    expect(suggestions.find((h) => h.originalDate === "2033-12-25")?.date).toBe(
      "2033-12-27",
    );
  });
  it("keeps only one entry per date and labels estimated lunar dates", () => {
    const { suggestions, notice } = holidaySuggestions("KE", 2027);
    expect(new Set(suggestions.map((h) => h.date)).size).toBe(
      suggestions.length,
    );
    expect(
      suggestions.find((h) => h.reason.includes("Eid al-Fitr"))?.note,
    ).toContain("Estimated lunar");
    expect(notice).toContain("faith-specific");
    expect(suggestions.some((h) => h.reason === "Easter Sunday")).toBe(false);
    expect(suggestions.some((h) => h.reason.includes("Eid al-Adha"))).toBe(
      false,
    );
  });
  it("keeps another country's names and substitution rules", () => {
    const { suggestions } = holidaySuggestions("US", 2027);
    expect(suggestions.some((h) => h.reason.includes("Independence Day"))).toBe(
      true,
    );
    expect(suggestions.some((h) => h.reason.includes("Mazingira"))).toBe(false);
    expect(
      suggestions.every(
        (h) => h.source === "HOLIDAY_SUGGESTION" && h.kind === "NON_WORKING",
      ),
    ).toBe(true);
  });
});
