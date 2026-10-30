"use client";

import { use } from "react";
import Link from "next/link";
import { HealthStandardEditor } from "@/components/tpm/health-checkups/HealthStandards";
import { useHealthCheckups } from "@/components/tpm/health-checkups/HealthCheckupsProvider";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { standards, loading, error, retry } = useHealthCheckups();
  if (loading || error)
    return (
      <div className="hc-empty" role={error ? "alert" : "status"}>
        <h2>{error ? "Could not load standard" : "Loading standard…"}</h2>
        {error && (
          <button type="button" className="tpm-button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  const standard = standards.find((item) => item.id === id);
  if (!standard)
    return (
      <div className="hc-empty" role="alert">
        <h2>Standard not found</h2>
        <Link href="/tpm/health-checkups" className="tpm-button">
          Back to standards
        </Link>
      </div>
    );
  return <HealthStandardEditor standard={standard} />;
}
