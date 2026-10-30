import { PlanDetails } from "@/components/tpm/planning/PlanDetails";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanDetails id={id} />;
}
