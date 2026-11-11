"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CalendarIndex } from "@/services/leadership-excellence/rules-calendar.service";
import { dateEntry } from "./calendar-editor";
import styles from "./rules-calendar.module.css";

export function CalendarCycleCard({
  calendar: c,
  editable,
  busy,
  timeZone,
  onOpen,
  onApproved,
  onCopy,
  onRemove,
}: {
  calendar: CalendarIndex["calendars"][number];
  editable: boolean;
  busy: boolean;
  timeZone: string;
  onOpen: () => void;
  onApproved: () => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const published = c.status === "APPROVED";
  const revision = !published && c.currentVersion > 0;
  const title = c.name || "Untitled cycle";
  let updated = "";
  if (c.updatedAt && !Number.isNaN(Date.parse(c.updatedAt))) {
    try {
      updated = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(new Date(c.updatedAt));
    } catch {
      /* A bad organisation zone must not hide the card. */
    }
  }
  return (
    <Card
      className={styles.cycleCard}
      onClick={(event) => {
        if (
          busy ||
          (event.target as Element).closest(
            "button, a, input, select, textarea, summary",
          ) ||
          window.getSelection()?.toString()
        )
          return;
        onOpen();
      }}
    >
      <div className={styles.cycleCardBody}>
        <div className={styles.cycleCardHeading}>
          <h3>
            <button
              type="button"
              className={styles.cycleTitle}
              disabled={busy}
              onClick={onOpen}
              aria-label={`Open ${title}`}
            >
              {title}
            </button>
          </h3>
          <span
            className={`${styles.statusBadge} ${published ? styles.approved : c.status === "IN_REVIEW" ? styles.review : styles.draft}`}
          >
            {published
              ? `Approved v${c.currentVersion}`
              : c.status === "IN_REVIEW"
                ? "Under review"
                : revision
                  ? "Draft revision"
                  : "Draft"}
          </span>
        </div>
        {revision && (
          <p className={styles.approvedAvailable}>
            Approved v{c.currentVersion} available
          </p>
        )}
        <dl className={styles.cycleFacts}>
          <div>
            <dt>{published ? "Cycle dates" : "Draft dates"}</dt>
            <dd>
              {c.start && c.end
                ? `${dateEntry(c.start)} – ${dateEntry(c.end)}`
                : "Not complete yet"}
            </dd>
          </div>
          <div>
            <dt>{published ? "Calendar assignment" : "Draft assignment"}</dt>
            <dd>
              {!c.audienceKind || c.audienceKind === "UNASSIGNED"
                ? "No company or group assigned"
                : c.audienceLabel}
            </dd>
          </div>
        </dl>
        {updated && <p className={styles.updatedAt}>Last updated {updated}</p>}
      </div>
      <div className={styles.cycleActions}>
        <div className={styles.cyclePrimaryActions}>
          <Button variant="outline" disabled={busy} onClick={onOpen}>
            {published
              ? "View approved calendar"
              : c.status === "IN_REVIEW"
                ? "Review calendar"
                : "Continue editing"}
          </Button>
          {revision && editable && (
            <Button variant="ghost" disabled={busy} onClick={onApproved}>
              View approved v{c.currentVersion}
            </Button>
          )}
        </div>
        {editable && (
          <div className={styles.cycleOtherActions}>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCopy}>
              {published ? `Copy approved v${c.currentVersion}` : "Copy draft"}
            </Button>
            {c.status === "DRAFT" && (
              <Button
                className={styles.removeDraft}
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onRemove}
              >
                {revision ? "Discard revision…" : "Delete draft…"}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
