"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateRoutine, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { RoutineForm } from "@/components/five-s/standards/RoutineForm";
import { Loading, PageHeader, Surface, errorMessage, linkButton } from "@/components/five-s/ui";

function NewRoutine() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: caps } = useFiveSCapabilities();
  const create = useCreateRoutine();
  if (!caps) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/five-s/standards?tab=routines" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Standards & routines
      </Link>
      <PageHeader title="New routine" description="A regular check that keeps an area to its standard. Routines do not change audit scores or create actions." />
      <Surface className="p-5">
        <RoutineForm
          mode="create"
          initial={{ areaId: params.get("areaId") ?? "", startDate: caps.today }}
          submitLabel="Create routine"
          busy={create.isPending}
          error={create.error ? errorMessage(create.error) : null}
          onCancel={() => router.push("/five-s/standards?tab=routines")}
          onSubmit={(values) =>
            create.mutate(values, {
              onSuccess: (r) => {
                toast("Routine created", "success");
                router.push(`/five-s/standards/routines/${r.id}`);
              },
            })
          }
        />
      </Surface>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewRoutinePage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewRoutine />
    </Suspense>
  );
}
