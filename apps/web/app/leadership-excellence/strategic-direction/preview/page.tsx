import { redirect } from "next/navigation";

// Area 01 is one scrollable page; this sidebar link opens it at the matching section.
export default function Page() {
  redirect("/leadership-excellence/strategic-direction/company-direction#review-section");
}
