"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateStandard, useStandardSource } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { StandardForm } from "@/components/five-s/standards/StandardForm";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
import { Loading, PageHeader, Surface, errorMessage, linkButton } from "@/components/five-s/ui";

function NewStandard() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const create = useCreateStandard();
  // Join 12 ("Standardise"): opened from a closed Kaizen or SGA, the draft starts from what worked there.
  const sourceParams = { kaizenId: params.get("fromKaizen") ?? undefined, sgaId: params.get("fromSga") ?? undefined };
  const fromImprovement = !!(sourceParams.kaizenId || sourceParams.sgaId);
  const source = useStandardSource(sourceParams);
  if (fromImprovement && source.isLoading) return <Loading />;
  const prefill = source.data;
  return (
    <div className="space-y-6">
      <Link href="/five-s/standards" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Standards & routines
      </Link>
      <PageHeader
        title={prefill ? "Standardise" : "New standard"}
        description={
          prefill
            ? "Write the method that worked into an area standard so it sticks. Pick the area, then edit the instructions. Saved as revision 1 in draft until the area HOD or a 5S administrator approves it."
            : "Saved as revision 1 in draft. It becomes the current standard once approved by the area HOD or a 5S administrator."
        }
      />
      {fromImprovement && !!source.error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage(source.error)}</p>
      )}
      {prefill && (
        <LinkedRecordChip
          label={prefill.kind === "KAIZEN" ? "From Kaizen:" : "From SGA:"}
          title={prefill.title}
          href={prefill.kind === "KAIZEN" ? `/kaizen/${prefill.id}` : `/sga/${prefill.id}`}
          tone={prefill.kind === "KAIZEN" ? "kaizen" : "sga"}
        />
      )}
      <Surface className="p-5">
        <StandardForm
          mode="create"
          initial={{
            areaId: params.get("areaId") ?? "",
            ...(prefill ? { title: prefill.title.slice(0, 200), instructions: prefill.instructions.slice(0, 8000), changeNote: prefill.changeNote } : {}),
          }}
          submitLabel="Save draft"
          busy={create.isPending}
          error={create.error ? errorMessage(create.error) : null}
          onCancel={() => router.push("/five-s/standards")}
          onSubmit={(values) =>
            create.mutate(
              {
                ...values,
                ...(prefill?.kind === "KAIZEN" ? { sourceKaizenId: prefill.id } : {}),
                ...(prefill?.kind === "SGA" ? { sourceSgaId: prefill.id } : {}),
              },
              {
                onSuccess: (s) => {
                  toast("Standard saved as a draft", "success");
                  router.push(`/five-s/standards/${s.id}`);
                },
              },
            )
          }
        />
      </Surface>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewStandardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewStandard />
    </Suspense>
  );
}
