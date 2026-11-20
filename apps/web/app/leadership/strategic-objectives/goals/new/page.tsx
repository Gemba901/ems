import { GoalForm } from "@/components/strategic-objectives/GoalForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    objectiveId?: string | string[];
    goalId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const objectiveId =
    typeof query.objectiveId === "string" ? query.objectiveId : undefined;
  const goalId = typeof query.goalId === "string" ? query.goalId : undefined;
  return (
    <GoalForm
      key={`${objectiveId ?? "missing"}:${goalId ?? "new"}`}
      objectiveId={objectiveId}
      goalId={goalId}
      invalidGoalId={
        query.goalId !== undefined && (!goalId || Array.isArray(query.goalId))
      }
    />
  );
}
