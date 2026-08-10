import {
  ClipboardList,
  Truck,
  Scale,
  Wrench,
  Flame,
  FlaskConical,
  Box,
  PackageCheck,
  Layers,
  BadgeCheck,
  Warehouse,
  Headset,
  LucideIcon,
} from "lucide-react";

export interface SteelProcessMeta {
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
  live: boolean;
}

// Single source of truth for process identity (name/description/icon/route) —
// shared by the manufacturing flow stepper and the process overview grid so
// neither invents its own copy.
export const STEEL_PROCESSES: SteelProcessMeta[] = [
  {
    code: "P01",
    name: "Demand, Sales Order & Production Planning",
    description: "Convert customer demand, sales order, or forecast into a confirmed, released production plan.",
    icon: ClipboardList,
    href: "/steel/p01",
    live: true,
  },
  {
    code: "P02",
    name: "Sourcing",
    description: "Arrange raw materials, billets, alloys, additives, or consumables from controlled suppliers.",
    icon: Truck,
    href: "/steel/p02",
    live: true,
  },
  {
    code: "P03",
    name: "Receiving & Inspection",
    description: "Weigh, inspect, accept or reject incoming material, and store it correctly in the yard.",
    icon: Scale,
    href: "/steel/p03",
    live: true,
  },
  {
    code: "P04",
    name: "Charge Preparation",
    description: "Prepare scrap, additives, and charge recipe, or prepare input material for the next process.",
    icon: Wrench,
    href: "/steel/p04",
    live: true,
  },
  {
    code: "P05",
    name: "Melting",
    description: "Melt the approved charge in the furnace to create liquid steel.",
    icon: Flame,
    href: "/steel/p05",
    live: false,
  },
  {
    code: "P06",
    name: "Heat Approval",
    description: "Test and correct liquid steel chemistry, check temperature, and approve the heat for casting.",
    icon: FlaskConical,
    href: "/steel/p06",
    live: false,
  },
  {
    code: "P07",
    name: "Casting",
    description: "Cast approved liquid steel into internal billets and store them with full traceability.",
    icon: Box,
    href: "/steel/p07",
    live: false,
  },
  {
    code: "P08",
    name: "Billet Control",
    description: "Control billets from own CCM, local, imported, or hot charge routes, and release the correct ones for rolling.",
    icon: PackageCheck,
    href: "/steel/p08",
    live: false,
  },
  {
    code: "P09",
    name: "Rolling",
    description: "Convert billets into rolled or TMT products through reheating, rolling, cooling, and cutting.",
    icon: Layers,
    href: "/steel/p09",
    live: false,
  },
  {
    code: "P10",
    name: "Finishing & Quality Certification",
    description: "Inspect, test, approve, bundle, tag, certify, and release the finished product.",
    icon: BadgeCheck,
    href: "/steel/p10",
    live: false,
  },
  {
    code: "P11",
    name: "Storage & Dispatch",
    description: "Store certified bundles, match to customer orders, load, document, and confirm delivery.",
    icon: Warehouse,
    href: "/steel/p11",
    live: false,
  },
  {
    code: "P12",
    name: "Customer Support",
    description: "Handle complaints, trace the issue back to its source, take corrective action, and close the loop.",
    icon: Headset,
    href: "/steel/p12",
    live: false,
  },
];
