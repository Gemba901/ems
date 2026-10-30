import { InspectionReportPage } from "@/components/tpm/inspections/InspectionReports";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InspectionReportPage id={id} />;
}
