"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ORG_CHART_PATH } from "@/components/ems/organisation-navigation";

/** Keep existing bookmarks, selected people and filter links working. The destination checks sign-in. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace(
      `${ORG_CHART_PATH}${window.location.search}${window.location.hash}`,
    );
  }, [router]);
  return <p role="status">Opening the org chart…</p>;
}
