import { StrategicRegister } from "@/components/strategic-objectives/FoundationScreens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string | string[];
    savedGoal?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <StrategicRegister
      highlightObjectiveId={
        typeof query.saved === "string" ? query.saved : undefined
      }
      highlightGoalId={
        typeof query.savedGoal === "string" ? query.savedGoal : undefined
      }
    />
  );
}
