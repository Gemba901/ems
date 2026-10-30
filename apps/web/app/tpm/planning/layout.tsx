import { Suspense, type ReactNode } from "react";
import "@/components/tpm/work-orders/work-orders.css";
import "@/components/tpm/planning/planning.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="wo-module">
      <Suspense
        fallback={
          <div className="tpm-loading" role="status">
            Opening maintenance planning…
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
