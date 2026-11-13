"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { PerformancePlanningService } from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { Button, card, ErrorList, Modal } from "./PlanningUi";
export function PlanningBackup() {
  const token = useAuthStore((s) => s.accessToken);
  const { data, refresh } = usePlanning();
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (!["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(data.actor.role))
    return null;
  async function download() {
    setError("");
    setBusy(true);
    try {
      const backup = await PerformancePlanningService.backup(token!);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `gemba-planning-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={card}>
      <summary className="cursor-pointer text-sm font-medium">
        Planning backup & restore
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-500">
          Management-only export includes confidential SWOT, source references,
          evidence and approved history. Store it securely. Restore accepts an
          unmodified backup for this organisation and preserves all existing
          approved versions.
        </p>
        <ErrorList error={error} />
        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void download()}
        >
          Download planning backup
        </Button>
        <label className="block text-sm">
          Restore a planning backup
          <input
            type="file"
            accept=".json"
            disabled={busy}
            className="mt-2 block w-full text-xs"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {file && (
        <Modal
          title="Restore this planning backup?"
          onClose={() => setFile(null)}
        >
          <p className="text-sm leading-6">
            This replaces current drafts with the selected backup. Newer
            approved history and existing records cannot be removed. Continue
            only if the saved draft content should replace your current work.
          </p>
          <p className="my-4 break-all text-sm font-medium">{file.name}</p>
          <ErrorList error={error} />
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setFile(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await PerformancePlanningService.restore(
                    token!,
                    data.revision,
                    file,
                  );
                  setFile(null);
                  setMessage("Planning backup restored.");
                  refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Restore failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore backup
            </Button>
          </div>
        </Modal>
      )}
    </details>
  );
}
