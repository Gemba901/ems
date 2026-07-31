"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import { uploadImage } from "@/services/uploads.service";
import { BENEFIT_CATEGORIES, formatDate, KaizenStepper, SectionLabel, SummaryPanel, TipCallout } from "@/components/kaizen/kaizen-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, X, Loader2, Send, CheckCircle2, ChevronDown, Save } from "lucide-react";

const PROBLEM_MIN = 10;
const PROBLEM_MAX = 1000;
const AUTO_CLOSE_MS = 5000;

function SuccessModal({ onClose }: { onClose: () => void }) {
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        onClose();
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center gap-5">
        <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-xl font-bold text-slate-900">Kaizen raised!</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your kaizen has been recorded. You can continue working on it any time.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          OK
        </button>
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-400 rounded-full transition-none" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function validate(problem: string, beforePhotoFile: File | null) {
  if (problem.trim().length < PROBLEM_MIN) return `Problem description must be at least ${PROBLEM_MIN} characters.`;
  if (problem.trim().length > PROBLEM_MAX) return `Problem description must be under ${PROBLEM_MAX} characters.`;
  if (!beforePhotoFile) return "Please attach a before photo.";
  return null;
}

export default function NewKaizenPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [problem, setProblem] = useState("");
  const [teamMembers, setTeamMembers] = useState("");
  const [benefitCategory, setBenefitCategory] = useState("");
  const [comments, setComments] = useState("");
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRedirect, setSuccessRedirect] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const createMutation = useMutation({
    mutationFn: async (startImprovement: boolean) => {
      let beforePhotoUrl = "";
      if (photoFile) {
        setUploading(true);
        const { fileUrl } = await uploadImage(photoFile, "kaizen", accessToken!);
        beforePhotoUrl = fileUrl;
        setUploading(false);
      }
      return KaizenService.create(
        {
          problem: problem.trim(),
          beforePhotoUrl,
          teamMembers: teamMembers.trim() || undefined,
          benefitCategory: benefitCategory || undefined,
          comments: comments.trim() || undefined,
          startImprovement,
        },
        accessToken!,
      );
    },
    onSuccess: (created) => setSuccessRedirect(`/kaizen/${created.id}`),
    onError: (err: any) => {
      setUploading(false);
      setError(err instanceof Error ? err.message : "Failed to raise kaizen");
    },
  });

  const submitting = createMutation.isPending;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Only image files are allowed."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Image must be under 10 MB."); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitKaizen = (startImprovement: boolean) => {
    const validationError = validate(problem, photoFile);
    if (validationError) { setError(validationError); return; }
    setError(null);
    createMutation.mutate(startImprovement);
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      {successRedirect && <SuccessModal onClose={() => router.push(successRedirect)} />}

      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto">
        <Link href="/kaizen" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Kaizens
        </Link>

        <div className="mb-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Step 1 of 3 · Create Kaizen</p>
          <h1 className="text-2xl font-bold text-slate-900">New Kaizen</h1>
          <p className="text-sm text-slate-500 mt-1">
            Capture a workplace problem and a before photo to start your Gemba kaizen.
          </p>
        </div>

        <div className="mb-5">
          <KaizenStepper current={1} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
            <form onSubmit={(e) => { e.preventDefault(); submitKaizen(false); }} className="space-y-6">

              <div>
                <SectionLabel n={1}>Problem Details</SectionLabel>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Problem <span className="text-red-500">*</span>
                      </label>
                      <span className={`text-xs ${problem.length > PROBLEM_MAX ? "text-red-500" : "text-slate-400"}`}>
                        {problem.length}/{PROBLEM_MAX}
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={problem}
                      onChange={(e) => { setProblem(e.target.value); setError(null); }}
                      placeholder="Describe the problem or waste you observed..."
                      className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all resize-none ${
                        problem.length > 0 && problem.length < PROBLEM_MIN
                          ? "border-amber-300 focus:ring-amber-500/20 focus:border-amber-400"
                          : "border-slate-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    />
                    {problem.length > 0 && problem.length < PROBLEM_MIN && (
                      <p className="text-xs text-amber-600 mt-1">{PROBLEM_MIN - problem.length} more characters needed</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                      Before Photo <span className="text-red-500">*</span>
                    </label>
                    {photoPreview ? (
                      <div className="relative w-full max-w-sm mx-auto rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoPreview} alt="Before preview" className="w-full max-h-60 object-contain" />
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-sm mx-auto flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-8 text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
                      >
                        <ImagePlus className="h-6 w-6" />
                        Click to attach a photo
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                  </div>
                </div>
              </div>

              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMoreDetail((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-slate-50 transition-colors"
                >
                  2. Additional Detail
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showMoreDetail ? "rotate-180" : ""}`} />
                </button>
                {showMoreDetail && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Team Members <span className="text-xs font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={teamMembers}
                          onChange={(e) => setTeamMembers(e.target.value)}
                          placeholder="Who else was involved?"
                          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Benefit Category <span className="text-xs font-normal text-slate-400">(optional)</span>
                        </label>
                        <select
                          value={benefitCategory}
                          onChange={(e) => setBenefitCategory(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        >
                          <option value="">Select a category...</option>
                          {BENEFIT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                        Comments <span className="text-xs font-normal text-slate-400">(optional)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Any other notes..."
                        className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Save className="h-4 w-4" /> Save Draft
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitKaizen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading photo...</>
                  ) : submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Send className="h-4 w-4" /> Start Improvement</>
                  )}
                </button>
                <Link href="/kaizen" className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancel
                </Link>
              </div>
            </form>
          </div>

          <SummaryPanel
            title="Kaizen Summary"
            rows={[
              { label: "Raised By", value: me ? `${me.firstName} ${me.lastName}` : "..." },
              { label: "Department", value: me?.department?.name ?? "No department" },
              { label: "Date", value: formatDate(new Date().toISOString()) },
              { label: "Status", value: "Draft" },
            ]}
          >
            <TipCallout>
              Describe the problem clearly and attach a before photo. You can save as a draft and come back later.
            </TipCallout>
          </SummaryPanel>
        </div>
      </div>
    </ProtectedRoute>
  );
}
