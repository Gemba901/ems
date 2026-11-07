import {
  findingPriority,
  findingWeightageText,
} from "@/services/leadership-excellence/performance-planning/finding-weightage";

export function FindingWeightage({ weightage }: { weightage?: unknown }) {
  const priority = findingPriority(weightage);
  const color =
    priority === "HIGH"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : priority === "MEDIUM"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : priority === "LOW"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-border bg-muted/50 text-muted-foreground";
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium ${color}`}
    >
      {findingWeightageText(weightage)}
    </span>
  );
}
