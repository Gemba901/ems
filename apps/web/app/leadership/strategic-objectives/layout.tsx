import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Strategic Objectives & Linked Goals | Gemba PMS",
};
export default function Layout(_props: { children: ReactNode }) {
  // Retire the synthetic prototype register; saved plans now have one canonical home.
  redirect("/leadership-excellence/performance-planning/objectives");
}
