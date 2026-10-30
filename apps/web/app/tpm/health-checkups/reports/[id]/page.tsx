import { HealthReportDetail } from "@/components/tpm/health-checkups/HealthCheckupRecords";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HealthReportDetail id={id} />;
}
