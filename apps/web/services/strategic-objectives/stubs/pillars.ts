import type { Pillar } from "../types";

// Rodgers owns the pillar master. Read-only fixtures; no master CRUD in this module.
export const pillars: readonly Pillar[] = [
  {
    code: "LEX",
    name: "Leadership",
    description: "Set direction, align priorities and lead execution.",
  },
  {
    code: "PEX",
    name: "People",
    description: "Build capability, engagement and effective teams.",
  },
  {
    code: "OPX",
    name: "Operational",
    description: "Deliver reliable, efficient and safe operations.",
  },
  {
    code: "CMX",
    name: "Customer & Market",
    description: "Strengthen customer value and market position.",
  },
  {
    code: "SGEX",
    name: "Governance & Sustainability",
    description: "Support accountable governance and sustainable performance.",
  },
  {
    code: "FPEX",
    name: "Financial",
    description: "Improve financial resilience and responsible growth.",
  },
];
