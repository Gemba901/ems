"use client";

import Link from "next/link";
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
  Factory,
  LucideIcon,
} from "lucide-react";

interface SteelProcess {
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
  available: boolean;
}

const STEEL_PROCESSES: SteelProcess[] = [
  {
    code: "P01",
    name: "Demand, Sales Order & Production Planning",
    description: "Convert customer demand, sales order, or forecast into a confirmed, released production plan.",
    icon: ClipboardList,
    href: "/steel/p01",
    available: true,
  },
  {
    code: "P02",
    name: "Sourcing",
    description: "Arrange raw materials, billets, alloys, additives, or consumables from controlled suppliers.",
    icon: Truck,
    href: "/steel/p02",
    available: true,
  },
  {
    code: "P03",
    name: "Receiving & Inspection",
    description: "Weigh, inspect, accept or reject incoming material, and store it correctly in the yard.",
    icon: Scale,
    href: "/steel/p03",
    available: true,
  },
  {
    code: "P04",
    name: "Charge Preparation",
    description: "Prepare scrap, additives, and charge recipe, or prepare input material for the next process.",
    icon: Wrench,
    href: "/steel/p04",
    available: false,
  },
  {
    code: "P05",
    name: "Melting",
    description: "Melt the approved charge in the furnace to create liquid steel.",
    icon: Flame,
    href: "/steel/p05",
    available: false,
  },
  {
    code: "P06",
    name: "Heat Approval",
    description: "Test and correct liquid steel chemistry, check temperature, and approve the heat for casting.",
    icon: FlaskConical,
    href: "/steel/p06",
    available: false,
  },
  {
    code: "P07",
    name: "Casting",
    description: "Cast approved liquid steel into internal billets and store them with full traceability.",
    icon: Box,
    href: "/steel/p07",
    available: false,
  },
  {
    code: "P08",
    name: "Billet Control",
    description: "Control billets from own CCM, local, imported, or hot charge routes, and release the correct ones for rolling.",
    icon: PackageCheck,
    href: "/steel/p08",
    available: false,
  },
  {
    code: "P09",
    name: "Rolling",
    description: "Convert billets into rolled or TMT products through reheating, rolling, cooling, and cutting.",
    icon: Layers,
    href: "/steel/p09",
    available: false,
  },
  {
    code: "P10",
    name: "Finishing & Quality Certification",
    description: "Inspect, test, approve, bundle, tag, certify, and release the finished product.",
    icon: BadgeCheck,
    href: "/steel/p10",
    available: false,
  },
  {
    code: "P11",
    name: "Storage & Dispatch",
    description: "Store certified bundles, match to customer orders, load, document, and confirm delivery.",
    icon: Warehouse,
    href: "/steel/p11",
    available: false,
  },
  {
    code: "P12",
    name: "Customer Support",
    description: "Handle complaints, trace the issue back to its source, take corrective action, and close the loop.",
    icon: Headset,
    href: "/steel/p12",
    available: false,
  },
];

export default function SteelModuleLandingPage() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
          <Factory className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Steel Manufacturing</h1>
          <p className="text-sm text-slate-500">Select a process to view or manage its activities.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEEL_PROCESSES.map((process) => {
          const Icon = process.icon;
          const cardContent = (
            <div
              className={`h-full rounded-2xl border p-4 transition-colors ${
                process.available
                  ? "border-slate-300 bg-white hover:border-slate-400 cursor-pointer"
                  : "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
              }`}
            >
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${
                  process.available ? "bg-slate-800" : "bg-slate-300"
                }`}
              >
                <Icon className="h-4.5 w-4.5 text-white" />
              </div>
              <p className="text-xs font-mono text-slate-400 mb-1">{process.code}</p>
              <p className="text-sm font-semibold text-slate-900 mb-1">{process.name}</p>
              <p className="text-xs text-slate-500 leading-snug mb-3">{process.description}</p>
              <span
                className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  process.available
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {process.available ? "Available" : "Coming soon"}
              </span>
            </div>
          );

          return process.available ? (
            <Link key={process.code} href={process.href}>
              {cardContent}
            </Link>
          ) : (
            <div key={process.code}>{cardContent}</div>
          );
        })}
      </div>
    </div>
  );
}