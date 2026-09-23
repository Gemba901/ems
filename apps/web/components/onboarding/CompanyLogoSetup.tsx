"use client";
import { useState } from "react";
import { ArrowRight, ImagePlus, Loader2 } from "lucide-react";
import { TenantImage } from "@/components/files/TenantImage";
import { AuthService } from "@/services/auth.service";
import { uploadImage } from "@/services/uploads.service";
import { useAuthStore } from "@/store/auth.store";
import { Notice, buttonClass } from "./OnboardingShell";

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
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
        Company profile
      </p>
      <h2 className="text-xl font-semibold tracking-tight">
        Add your company logo
      </h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-slate-500">
        Add a logo for {user?.organizationName || "your company"} or do this
        later in Company Settings.
      </p>
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white p-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-slate-50">
          {user?.organizationUrl ? (
            <TenantImage
              src={user.organizationUrl}
              alt="Company logo"
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <ImagePlus size={36} className="text-blue-400" />
          )}
        </div>
        <label
          className={`${buttonClass} relative cursor-pointer focus-within:ring-4 focus-within:ring-blue-200`}
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ImagePlus size={18} />
          )}
          {busy ? "Saving logo…" : "Choose company logo"}
          <input
            type="file"
            aria-label="Choose company logo"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={upload}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </label>
        <p className="text-xs text-slate-500">PNG, JPG or WebP · Up to 5 MB</p>
      </div>
      {error && (
        <div className="mt-3">
          <Notice error>{error}</Notice>
        </div>
      )}
      {saved && (
        <div className="mt-3">
          <Notice>Your company logo is saved.</Notice>
        </div>
      )}
      <button
        disabled={busy}
        onClick={onContinue}
        className={`${buttonClass} mt-3 w-full`}
      >
        {saved ? "Enter your workspace" : "Skip for now & enter workspace"}
        <ArrowRight size={18} />
      </button>
    </>
  );
}
