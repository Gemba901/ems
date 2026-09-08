"use client";

// P02's document primitives now live in components/steel/shared/document.tsx
// so they can be reused by P01 and other steel processes. This file
// re-exports them under their original P02-specific names so S1-S5 (and any
// other existing P02 imports) keep working unchanged.
export {
  DocStatusBadge,
  DocSection,
  DocGrid,
  DocField,
  SummaryBlock,
  PillSelect,
  StickyActions,
  P02Layout,
  P02InfoCard,
  ErrorBanner,
  AuditMeta,
} from "@/components/steel/shared/document";
export type { DocSectionStatus, DocFieldKind } from "@/components/steel/shared/document";
