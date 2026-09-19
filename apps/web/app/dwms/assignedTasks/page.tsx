import { redirect } from "next/navigation";

export default function AssignedTasksLegacyPage() {
  redirect("/dwms/tasks?view=by-me");
}
