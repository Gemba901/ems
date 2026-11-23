import { ObjectiveForm } from "@/components/strategic-objectives/ObjectiveForm";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ objectiveId?: string | string[] }>;
}) {
  const query = await searchParams;
  const objectiveId =
    typeof query.objectiveId === "string" ? query.objectiveId : undefined;
  return <ObjectiveForm key={objectiveId ?? "new"} objectiveId={objectiveId} />;
}
