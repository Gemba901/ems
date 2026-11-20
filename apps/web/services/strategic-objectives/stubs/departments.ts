import type { Department } from "../types";

// Kendi's EMS will provide these records. All names and IDs here are synthetic.
export const departments: readonly Department[] = [
  { id: "demo-dept-leadership", name: "Leadership" },
  { id: "demo-dept-production", name: "Production" },
  { id: "demo-dept-quality", name: "Quality" },
  { id: "demo-dept-maintenance", name: "Maintenance" },
  { id: "demo-dept-supply", name: "Supply Chain" },
  { id: "demo-dept-people", name: "People & Culture" },
  { id: "demo-dept-finance", name: "Finance" },
  { id: "demo-dept-sales", name: "Sales & Customer Success" },
];
