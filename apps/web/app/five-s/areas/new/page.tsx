"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateArea, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { AreaForm } from "@/components/five-s/areas/AreaForm";
import { ErrorNote, Loading, PageHeader, Surface, errorMessage, linkButton } from "@/components/five-s/ui";

export default function NewAreaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: caps, isLoading } = useFiveSCapabilities();
  const create = useCreateArea();

  if (isLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/five-s/areas" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Workplace areas
      </Link>
      <PageHeader title="New workplace area" description="Areas are the places you audit: production lines, stores, workshops or offices." />
      {!caps?.canCreateAreas ? (
        <ErrorNote>Only 5S administrators and HODs can create workplace areas.</ErrorNote>
      ) : (
        <Surface className="p-5">
          <AreaForm
            submitLabel="Create area"
            busy={create.isPending}
            error={create.error ? errorMessage(create.error) : null}
            onCancel={() => router.push("/five-s/areas")}
            onSubmit={(values) =>
              create.mutate(values, {
                onSuccess: (area) => {
                  toast(`Area "${area.name}" created`, "success");
                  router.push(`/five-s/areas/${area.id}`);
                },
              })
            }
          />
        </Surface>
      )}
    </div>
  );
}
