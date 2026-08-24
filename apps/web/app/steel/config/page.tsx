"use client";

import Link from "next/link";
import { Settings, Package, FileText, Users, Truck, Route, Boxes, Flame, Upload, ChevronRight } from "lucide-react";
import { ScreenHeader } from "@/components/steel/ScreenHeader";

const SECTIONS = [
  { href: "/steel/config/products", icon: Package, title: "Products", description: "Product catalog and product types" },
  { href: "/steel/config/product-specifications", icon: FileText, title: "Product Specifications", description: "Grade, size, standard, length per product" },
  { href: "/steel/config/customers", icon: Users, title: "Customers", description: "Customer master, credit status, delivery location" },
  { href: "/steel/config/dealers", icon: Truck, title: "Dealers", description: "Dealer master by region" },
  { href: "/steel/config/routes", icon: Route, title: "Production Routes", description: "Ordered process steps and departments" },
  { href: "/steel/config/materials", icon: Boxes, title: "Materials", description: "Raw-material catalog (name, code, unit)" },
  { href: "/steel/config/furnaces", icon: Flame, title: "Equipment / Furnaces", description: "Furnace and lining master data" },
  { href: "/steel/config/import", icon: Upload, title: "Import / Export", description: "Bulk-load master data from CSV/Excel" },
];

export default function SteelConfigPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <ScreenHeader
        icon={Settings}
        title="Steel Configuration"
        subtitle="Company master data used by Production Planning (P01) and downstream Steel processes."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="h-9 w-9 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground truncate">{s.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
