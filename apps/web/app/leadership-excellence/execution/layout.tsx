import { Suspense, type ReactNode } from "react";
import { ExecutionProvider } from "@/components/leadership-excellence/execution/ExecutionProvider";
import { ExecutionFrame } from "@/components/leadership-excellence/execution/ExecutionFrame";

export default function ExecutionLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-muted-foreground">Loading performance execution…</p>
      }
    >
      <ExecutionProvider>
        <ExecutionFrame>{children}</ExecutionFrame>
      </ExecutionProvider>
    </Suspense>
  );
}
