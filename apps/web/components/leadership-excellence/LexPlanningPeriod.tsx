"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuthStore } from "@/store/auth.store";

type PlanningPeriodSelection = {
  cycle: string;
  setCycle: (cycle: string) => void;
};

const Context = createContext<PlanningPeriodSelection | null>(null);

export function useLexPlanningPeriod() {
  const value = useContext(Context);
  if (!value) throw new Error("LexPlanningPeriodProvider is required.");
  return value;
}

function PeriodSelection({ children }: { children: ReactNode }) {
  const [cycle, setCycle] = useState("");
  return (
    <Context.Provider value={{ cycle, setCycle }}>{children}</Context.Provider>
  );
}

/** Keep the period across areas without carrying another organisation's selection. */
export function LexPlanningPeriodProvider({ children }: { children: ReactNode }) {
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const userId = useAuthStore((state) => state.user?.userId);
  return (
    <PeriodSelection key={JSON.stringify([organizationId, userId])}>
      {children}
    </PeriodSelection>
  );
}
