"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateRedTag, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { RedTagForm } from "@/components/five-s/red-tags/RedTagForm";
import { Loading, PageHeader, Surface, errorMessage, linkButton, today } from "@/components/five-s/ui";

function NewRedTag() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: caps, isLoading } = useFiveSCapabilities();
  const create = useCreateRedTag();
  if (isLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/five-s/red-tags" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Red-tag register
      </Link>
      <PageHeader title="Raise a red tag" description="Tag an item whose need is in doubt. It moves to the holding decision: retain, relocate, repair, recycle or dispose." />
      <Surface className="p-5">
        <RedTagForm
          mode="create"
          initial={{ areaId: params.get("areaId") ?? "" }}
          maxDate={caps?.today ?? today()}
          submitLabel="Raise red tag"
          busy={create.isPending}
          error={create.error ? errorMessage(create.error) : null}
          onCancel={() => router.push("/five-s/red-tags")}
          onSubmit={(values) =>
            create.mutate(values, {
              onSuccess: (tag) => {
                toast(`Red tag ${tag.reference} raised`, "success");
                router.push(`/five-s/red-tags/${tag.id}`);
              },
            })
          }
        />
      </Surface>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewRedTagPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewRedTag />
    </Suspense>
  );
}
