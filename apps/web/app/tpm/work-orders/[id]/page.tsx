import { WorkOrderDetails } from "@/components/tpm/work-orders/WorkOrderDetails";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkOrderDetails id={id} />;
}
