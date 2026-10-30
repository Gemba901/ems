import { NewInspection } from "@/components/tpm/inspections/InspectionReports";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checklist?: string | string[] }>;
}) {
  const { checklist } = await searchParams;
  return (
    <NewInspection
      checklistId={typeof checklist === "string" ? checklist : undefined}
    />
  );
}
