// Display rules mirror the API's authoritative SWOT assessment validation.
// Missing/legacy scores are not inferred from a previously chosen priority.
export function validFindingWeightage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

export function findingPriority(
  value: unknown,
): "LOW" | "MEDIUM" | "HIGH" | "" {
  if (!validFindingWeightage(value)) return "";
  return value <= 3 ? "LOW" : value <= 6 ? "MEDIUM" : "HIGH";
}

export function findingWeightageText(value: unknown) {
  const priority = findingPriority(value);
  return priority
    ? `Weightage ${value}/10 · ${priority[0]}${priority.slice(1).toLowerCase()}`
    : "Weightage: Not assessed";
}

export function compareFindingWeightage(
  a: { weightage?: number | null; code: string },
  b: { weightage?: number | null; code: string },
) {
  const left = validFindingWeightage(a.weightage) ? a.weightage : -1;
  const right = validFindingWeightage(b.weightage) ? b.weightage : -1;
  return (
    right - left || a.code.localeCompare(b.code, undefined, { numeric: true })
  );
}
