import { redirect } from "next/navigation";

/** Departments now live under EMS → Organisation; old links and bookmarks land there. */
export default function DepartmentsRedirect() {
  redirect("/ems/organisation");
}
