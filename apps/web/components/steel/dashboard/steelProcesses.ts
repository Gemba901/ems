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

export interface SteelProcessColor {
  bg: string;
  text: string;
  bar: string;
}

export interface SteelProcessMeta {
  code: string;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  href: string;
  live: boolean;
  color: SteelProcessColor;
}

// Single source of truth for process identity (name/description/icon/route/
// color) — shared by the manufacturing flow stepper and the process overview
// grid so neither invents its own copy.
export const STEEL_PROCESSES: SteelProcessMeta[] = [
  {
    code: "P01",
    name: "Demand, Sales Order & Production Planning",
    shortName: "Production Planning",
    description: "Convert customer demand into an approved production plan.",
    icon: ClipboardList,
    href: "/steel/p01",
    live: true,
    color: { bg: "bg-blue-50", text: "text-blue-600" , bar: "bg-blue-600" },
  },
  {
    code: "P02",
    name: "Sourcing",
    shortName: "Sourcing & Procurement",
    description: "Source required materials and manage supplier purchasing.",
    icon: Truck,
    href: "/steel/p02",
    live: true,
    color: { bg: "bg-orange-50", text: "text-orange-600" , bar: "bg-orange-600" },
  },
  {
    code: "P03",
    name: "Receiving & Inspection",
    shortName: "Receiving & Inspection",
    description: "Receive incoming materials, inspect them, and place approved material into stock.",
    icon: Scale,
    href: "/steel/p03",
    live: true,
    color: { bg: "bg-cyan-50", text: "text-cyan-600" , bar: "bg-cyan-600" },
  },
  {
    code: "P04",
    name: "Charge Preparation",
    shortName: "Charge Preparation",
    description: "Prepare, verify, and release the raw-material charge for the furnace.",
    icon: Wrench,
    href: "/steel/p04",
    live: true,
    color: { bg: "bg-teal-50", text: "text-teal-600" , bar: "bg-teal-600" },
  },
  {
    code: "P05",
    name: "Melting",
    shortName: "Melting",
    description: "Melt the prepared charge and manage the furnace heat process.",
    icon: Flame,
    href: "/steel/p05",
    live: false,
    color: { bg: "bg-red-50", text: "text-red-500" , bar: "bg-red-500" },
  },
  {
    code: "P06",
    name: "Heat Approval",
    shortName: "Heat Approval",
    description: "Review heat results and approve the heat for the next production stage.",
    icon: FlaskConical,
    href: "/steel/p06",
    live: false,
    color: { bg: "bg-indigo-50", text: "text-indigo-500" , bar: "bg-indigo-500" },
  },
  {
    code: "P07",
    name: "Casting",
    shortName: "Casting",
    description: "Cast the approved molten steel into billets or other required forms.",
    icon: Box,
    href: "/steel/p07",
    live: false,
    color: { bg: "bg-emerald-50", text: "text-emerald-500" , bar: "bg-emerald-500" },
  },
  {
    code: "P08",
    name: "Billet Control",
    shortName: "Billet Control",
    description: "Track, inspect, identify, and control billets before rolling.",
    icon: PackageCheck,
    href: "/steel/p08",
    live: false,
    color: { bg: "bg-green-50", text: "text-green-500" , bar: "bg-green-500" },
  },
  {
    code: "P09",
    name: "Rolling",
    shortName: "Rolling",
    description: "Roll billets into the required finished steel products and sizes.",
    icon: Layers,
    href: "/steel/p09",
    live: false,
    color: { bg: "bg-pink-50", text: "text-pink-500" , bar: "bg-pink-500" },
  },
  {
    code: "P10",
    name: "Finishing & Quality Certification",
    shortName: "Quality Control",
    description: "Inspect finished products and verify they meet required quality standards.",
    icon: BadgeCheck,
    href: "/steel/p10",
    live: false,
    color: { bg: "bg-lime-50", text: "text-lime-600" , bar: "bg-lime-600" },
  },
  {
    code: "P11",
    name: "Storage & Dispatch",
    shortName: "Storage & Dispatch",
    description: "Store approved products and manage customer dispatch and delivery.",
    icon: Warehouse,
    href: "/steel/p11",
    live: false,
    color: { bg: "bg-sky-50", text: "text-sky-500" , bar: "bg-sky-500" },
  },
  {
    code: "P12",
    name: "Customer Support",
    shortName: "Customer Support",
    description: "Manage customer requests, issues, feedback, and post-delivery support.",
    icon: Headset,
    href: "/steel/p12",
    live: false,
    color: { bg: "bg-purple-50", text: "text-purple-500" , bar: "bg-purple-500" },
  },
];
