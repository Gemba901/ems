import type { AssetInput } from "./asset-preview";

// Full names from the workbook's Dropdown 1 sheet. Ratings are deliberately
// excluded from display labels; stored enum values stay stable.
const labels: Partial<
  Record<keyof AssetInput, Readonly<Record<string, string>>>
> = {
  usage: {
    Active: "Active - Regularly Used",
    Intermittent: "Intermittent - Occasionally Used",
    Inactive: "Inactive - Currently Not Used",
    Retired: "Retired - Permanently Withdrawn",
  },
  economicImpact: {
    High: "High Value Contribution",
    Moderate: "Moderate Value Contribution",
    Low: "Low to Negligible Value",
    "Zero contribution": "Zero Value Contribution",
    "Operational value adding": "Operational Value Adding (OPVA)",
  },
  criticality: {
    A: "A - High Criticality: First Priority",
    B: "B - Medium Criticality: Second Priority",
    C: "C - Low Criticality: Third Priority",
  },
};

export function assetOptionLabel(
  field: keyof AssetInput,
  value: string,
): string {
  const fieldLabels = labels[field];
  return fieldLabels && Object.hasOwn(fieldLabels, value)
    ? fieldLabels[value]
    : value;
}
