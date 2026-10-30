import { Suspense, type ReactNode } from "react";
import "@/components/tpm/work-orders/work-orders.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="wo-module">
      <Suspense
        fallback={
          <div className="tpm-loading" role="status">
            Opening work orders…
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
