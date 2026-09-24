"use client";
import { useState } from "react";
import { ArrowRight, ImagePlus, Loader2 } from "lucide-react";
import { TenantImage } from "@/components/files/TenantImage";
import { AuthService } from "@/services/auth.service";
import { uploadImage } from "@/services/uploads.service";
import { useAuthStore } from "@/store/auth.store";
import {
  Notice,
  StepHeading,
  buttonClass,
  secondaryButtonClass,
} from "./OnboardingShell";

export function CompanyLogoSetup({ onContinue }: { onContinue: () => void }) {
  const { user, accessToken, setAuth } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken || !user) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPG or WebP image up to 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { fileUrl } = await uploadImage(file, "logos", accessToken);
      await AuthService.updateMyOrg(accessToken, { logoUrl: fileUrl });
      setAuth({ ...user, organizationUrl: fileUrl }, accessToken);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your logo. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <StepHeading title="Add your company logo">
        It appears in the sidebar and on reports for{" "}
        {user?.organizationName || "your company"}. You can change it later in
        Company Settings.
      </StepHeading>
      <div className="flex items-center gap-5 rounded-lg border border-slate-200 p-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
          {user?.organizationUrl ? (
            <TenantImage
              src={user.organizationUrl}
              alt="Company logo"
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <ImagePlus size={26} className="text-slate-400" />
          )}
        </div>
        <div className="space-y-2">
          <label
            className={`${secondaryButtonClass} relative cursor-pointer focus-within:ring-3 focus-within:ring-gemba-navy/20`}
          >
            {busy && <Loader2 size={17} className="animate-spin" />}
            {busy ? "Saving logo…" : "Choose file"}
            <input
              type="file"
              aria-label="Choose company logo"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={upload}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </label>
          <p className="text-xs text-slate-500">PNG, JPG or WebP, up to 5 MB</p>
        </div>
      </div>
      {error && (
        <div className="mt-5">
          <Notice error>{error}</Notice>
        </div>
      )}
      {saved && (
        <div className="mt-5">
          <Notice>Your company logo is saved.</Notice>
        </div>
      )}
      <button
        disabled={busy}
        onClick={onContinue}
        className={`${buttonClass} mt-8 w-full`}
      >
        {saved ? "Continue to workspace" : "Skip for now"}
        <ArrowRight size={17} />
      </button>
    </>
  );
}
