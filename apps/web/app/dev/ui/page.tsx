import { notFound } from "next/navigation";
import { UiShowcase } from "@/components/dev/ui-showcase";

export default function UiPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_UI !== "true"
  ) {
    notFound();
  }
  return <UiShowcase />;
}
