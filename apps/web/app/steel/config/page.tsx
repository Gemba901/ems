"use client";

import Link from "next/link";
import {
  Settings, Package, FileText, Users, Truck, Route, Boxes, Flame, Upload, ChevronRight,
  ShoppingCart, Link2, Scale,
} from "lucide-react";
import { ScreenHeader } from "@/components/steel/ScreenHeader";

const MASTER_DATA_SECTIONS = [
  { href: "/steel/config/products", icon: Package, title: "Products", description: "Product catalog and product types" },
  { href: "/steel/config/product-specifications", icon: FileText, title: "Product Specifications", description: "Grade, size, standard, length per product" },
  { href: "/steel/config/customers", icon: Users, title: "Customers", description: "Customer master, credit status, delivery location" },
  { href: "/steel/config/dealers", icon: Truck, title: "Dealers", description: "Dealer master by region" },
  { href: "/steel/config/routes", icon: Route, title: "Production Routes", description: "Ordered process steps and departments" },
  { href: "/steel/config/furnaces", icon: Flame, title: "Equipment / Furnaces", description: "Furnace and lining master data" },
  { href: "/steel/config/import", icon: Upload, title: "Import / Export", description: "Bulk-load master data from CSV/Excel" },
];

// Everything P02 procurement draws on as controlled master data — grouped
// separately so it reads as one coherent "who can supply what, and on what
// terms" area rather than being scattered among general master data.
const PROCUREMENT_SECTIONS = [
  { href: "/steel/config/materials", icon: Boxes, title: "Materials", description: "Raw-material catalog, classification, and procurement type" },
  { href: "/steel/config/suppliers", icon: Users, title: "Suppliers", description: "Supplier master — approval status, materials supplied, location" },
  { href: "/steel/config/supplier-eligibility", icon: Link2, title: "Supplier Eligibility", description: "Which suppliers can supply which materials" },
  { href: "/steel/config/qcd-criteria", icon: Scale, title: "QCD Criteria", description: "Quality/Cost/Delivery weights for supplier comparison" },
  { href: "/steel/config/procurement-terms", icon: ShoppingCart, title: "Procurement Terms", description: "Payment terms, Incoterms, currency, transport, documents" },
];

function SectionGrid({ sections }: { sections: typeof MASTER_DATA_SECTIONS }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {sections.map((s) => (
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
  );
}

export default function SteelConfigPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <ScreenHeader
        icon={Settings}
        title="Steel Configuration"
        subtitle="Company master data used by Production Planning (P01) and downstream Steel processes."
      />

      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Master Data</h2>
        <SectionGrid sections={MASTER_DATA_SECTIONS} />
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Procurement (P02)</h2>
        <SectionGrid sections={PROCUREMENT_SECTIONS} />
      </div>
    </div>
  );
}
