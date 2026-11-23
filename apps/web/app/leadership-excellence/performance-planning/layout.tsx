import type { ReactNode } from "react";
import { PlanningProvider } from "@/components/leadership-excellence/performance-planning/PlanningProvider";

export default function Layout({ children }: { children: ReactNode }) {
  return <PlanningProvider>{children}</PlanningProvider>;
}
