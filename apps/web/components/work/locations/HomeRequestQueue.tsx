"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { FormField } from "@/components/patterns/FormField";
import { useState } from "react";
import { House, Loader2 } from "lucide-react";
import { useHomeRequests, useLocationSettings, useReviewHomeRequest } from "@/hooks/work/useWork";
import { formatDay, formatDistance } from "@/lib/work/location";
import type { HomeRequest } from "@/services/work.service";
import { LocationMap, MapLegend } from "@/components/work/LocationMap";
import { HelpTip, WorkDialog, errorMessage } from "@/components/work/ui";

const DEFAULT_HOME_RADIUS = 150;

function moved(request: HomeRequest): number | null {
  const home = request.currentHome;
  if (!home) return null;
  const rad = Math.PI / 180;
  const dLat = (request.latitude - home.latitude) * rad;
  const dLng = (request.longitude - home.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(home.latitude * rad) * Math.cos(request.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ReviewDialog({ request, homeRadius, onClose }: { request: HomeRequest; homeRadius: number; onClose: () => void }) {
  const review = useReviewHomeRequest();
  const [note, setNote] = useState("");
  const decide = (decision: "APPROVED" | "REJECTED") =>
    review.mutate({ requestId: request.id, decision, note: note.trim() || undefined }, { onSuccess: onClose });
  const distance = moved(request);

  return (
    <WorkDialog
      open
      size="lg"
      onOpenChange={(open) => { if (!open && !review.isPending) onClose(); }}
      title={`Home location for ${request.employee.name}`}
      description={`Captured on their device on ${formatDay(request.capturedAt)}.`}
      footer={
        <>
          <Button type="button" variant="outline" disabled={review.isPending} onClick={() => decide("REJECTED")}>
            Reject
          </Button>
          <Button type="button" disabled={review.isPending} onClick={() => decide("APPROVED")}>
            {review.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <LocationMap
          label="Map of the requested home location"
          className="h-72"
          point={{ latitude: request.latitude, longitude: request.longitude, accuracyMeters: request.accuracyMeters, label: "Requested home" }}
          places={request.currentHome ? [{ ...request.currentHome, radiusMeters: homeRadius, name: "Current approved home", kind: "HOME" }] : []}
        />
        <MapLegend point="Requested home (dashed ring: GPS accuracy)" home={Boolean(request.currentHome)} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Accuracy</dt>
          <dd className="text-foreground">± {Math.round(request.accuracyMeters)} m</dd>
          <dt className="text-muted-foreground">Current home</dt>
          <dd className="text-foreground">
            {request.currentHome ? `Approved ${formatDay(request.currentHome.approvedAt)}${distance != null ? ` · ${formatDistance(distance)} from the new one` : ""}` : "None yet"}
          </dd>
          {request.note && (
            <>
              <dt className="text-muted-foreground">Their note</dt>
              <dd className="whitespace-pre-wrap text-foreground">{request.note}</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Approving makes this the place their remote clock-ins are checked against. Until then, their current home stays in force.
        </p>
        <FormField label="Note to them (optional)" id="review-note">
          <Textarea id="review-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {review.isError && <ErrorState description={errorMessage(review.error, "Could not save the review.")} />}
      </div>
    </WorkDialog>
  );
}

/**
 * Home locations waiting for approval. HR sees everyone's, a manager their direct reports'.
 * `hideWhenEmpty` keeps it out of the way on pages where it is a side panel.
 */
export function HomeRequestQueue({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const requests = useHomeRequests("PENDING");
  const settings = useLocationSettings();
  const [reviewing, setReviewing] = useState<HomeRequest | null>(null);

  if (hideWhenEmpty && (!requests.data || requests.data.length === 0)) return null;

  return (
    <Card className="block py-0">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <h2 className="text-base font-semibold text-foreground">Home locations to approve</h2>
        <HelpTip label="About home locations">
          Remote and hybrid employees capture their home on their own device while there. Once approved, it is what their clock-ins
          are checked against.
        </HelpTip>
      </div>
      {requests.isPending ? (
        <LoadingState />
      ) : requests.isError ? (
        <div className="p-4">
          <ErrorState description={errorMessage(requests.error, "Could not load home location requests.")} />
        </div>
      ) : requests.data.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing waiting" description="New home locations will appear here." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {requests.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <House className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{r.employee.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.currentHome ? "Changing their home" : "First home"} · sent {formatDay(r.createdAt)}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setReviewing(r)}>
                Review<span className="sr-only"> {r.employee.name}&rsquo;s home location</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {reviewing && <ReviewDialog request={reviewing} homeRadius={settings.data?.homeRadiusMeters ?? DEFAULT_HOME_RADIUS} onClose={() => setReviewing(null)} />}
    </Card>
  );
}
