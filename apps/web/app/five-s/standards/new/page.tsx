"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateStandard } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { StandardForm } from "@/components/five-s/standards/StandardForm";
import { Loading, PageHeader, Surface, errorMessage, linkButton } from "@/components/five-s/ui";

function NewStandard() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const create = useCreateStandard();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/five-s/standards" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Standards & routines
      </Link>
      <PageHeader title="New standard" description="Saved as revision 1 in draft. It becomes the current standard once approved by the area HOD or a 5S administrator." />
      <Surface className="p-5">
        <StandardForm
          mode="create"
          initial={{ areaId: params.get("areaId") ?? "" }}
          submitLabel="Save draft"
          busy={create.isPending}
          error={create.error ? errorMessage(create.error) : null}
          onCancel={() => router.push("/five-s/standards")}
          onSubmit={(values) =>
            create.mutate(values, {
              onSuccess: (s) => {
                toast("Standard saved as a draft", "success");
                router.push(`/five-s/standards/${s.id}`);
              },
            })
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
