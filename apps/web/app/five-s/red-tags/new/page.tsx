"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/patterns/PageHeader";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCreateRedTag, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { RedTagForm } from "@/components/five-s/red-tags/RedTagForm";
import { errorMessage, today } from "@/components/five-s/ui";

function NewRedTag() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: caps, isLoading, error, refetch } = useFiveSCapabilities();
  const create = useCreateRedTag();
  if (isLoading) return <LoadingState label="Loading red-tag form…" />;
  if (error) return <ErrorState title="Unable to load red-tag form" description={errorMessage(error)} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-section">
      <PageHeader
        title="Raise a red tag"
        description="Tag an item for review. Possible decisions include retaining, relocating, repairing, recycling, or disposing of it."
        breadcrumbs={[{ label: "Red-tag register", href: "/five-s/red-tags" }, { label: "Raise a red tag" }]}
      />
      <Card className="p-5">
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
      </Card>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewRedTagPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading red-tag form…" />}>
      <NewRedTag />
    </Suspense>
  );
}
