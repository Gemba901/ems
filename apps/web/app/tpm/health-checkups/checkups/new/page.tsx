import { Suspense } from "react";
import { NewHealthCheckup } from "@/components/tpm/health-checkups/HealthCheckupRecords";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="hc-empty" role="status">
          Loading…
        </div>
      }
    >
      <NewHealthCheckup />
    </Suspense>
  );
}
