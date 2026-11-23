export type BusinessAlignmentRecord = {
  alignments?: readonly string[];
  alignment?: string;
  otherBusinessFocus?: string;
};

const names: Record<string, string> = {
  Q: "Quality",
  C: "Cost",
  D: "Delivery",
  S: "Safety",
  M: "Morale",
  T: "Technology",
  OTHER: "Business focus",
};
const order = ["Q", "C", "D", "S", "M", "T", "OTHER"];

/** Arrays, including [], are authoritative. Scalar and full-name support is for old records. */
export function businessAlignmentSelections(
  record: BusinessAlignmentRecord,
): string[] {
  const values = Array.isArray(record.alignments)
    ? record.alignments
    : record.alignment
      ? [record.alignment]
      : [];
  const selected = new Set(
    values.map((value) => {
      const normalized = value.trim().toUpperCase();
      if (order.includes(normalized)) return normalized;
      return (
        order.find((code) => names[code].toUpperCase() === normalized) || ""
      );
    }),
  );
  return order.filter((code) => selected.has(code));
}

/** User-facing labels never expose the compatibility key used for business focus. */
export function businessAlignmentLabels(
  record: BusinessAlignmentRecord,
): string[] {
  return businessAlignmentSelections(record).map((code) =>
    code === "OTHER"
      ? `Business focus${record.otherBusinessFocus?.trim() ? `: ${record.otherBusinessFocus.trim()}` : ""}`
      : `${code} · ${names[code]}`,
  );
}
