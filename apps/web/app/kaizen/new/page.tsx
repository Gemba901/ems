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
import {
  BENEFIT_CATEGORIES,
  KAIZEN_TRIGGERS,
  formatDate,
  KaizenStepper,
  SectionLabel,
  SummaryPanel,
  TipCallout,
} from "@/components/kaizen/kaizen-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImagePlus,
  X,
  Loader2,
  Send,
  CheckCircle2,
  ChevronDown,
  Save,
} from "lucide-react";
import type { KaizenTrigger } from "@/services/kaizen.service";

const PROBLEM_MIN = 10;
const PROBLEM_MAX = 1000;
const TITLE_MIN = 5;
const TITLE_MAX = 150;
const MAX_PHOTOS = 5;
const AUTO_CLOSE_MS = 5000;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

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
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
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
            Your kaizen has been recorded. You can continue working on it any
            time.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          OK
        </button>
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function validate(
  title: string,
  trigger: KaizenTrigger | "",
  triggerOther: string,
  targetCompletionDate: string,
  photoFiles: File[],
) {
  if (title.trim().length < TITLE_MIN)
    return `Kaizen title must be at least ${TITLE_MIN} characters.`;
  if (title.trim().length > TITLE_MAX)
    return `Kaizen title must be under ${TITLE_MAX} characters.`;
  if (!trigger) return "Please select why this Daily Kaizen was started.";
  if (trigger === "OTHER") {
    if (triggerOther.trim().length < PROBLEM_MIN)
      return `Please explain in at least ${PROBLEM_MIN} characters.`;
    if (triggerOther.trim().length > PROBLEM_MAX)
      return `Explanation must be under ${PROBLEM_MAX} characters.`;
  }
  if (!targetCompletionDate) return "Please set a target completion date.";
  if (targetCompletionDate < todayIsoDate())
    return "Target completion date cannot be in the past.";
  if (photoFiles.length === 0) return "Please attach at least one before photo.";
  return null;
}

export default function NewKaizenPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [title, setTitle] = useState("");
  const [trigger, setTrigger] = useState<KaizenTrigger | "">("");
  const [triggerOther, setTriggerOther] = useState("");
  const [targetCompletionDate, setTargetCompletionDate] = useState("");

  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [benefitCategory, setBenefitCategory] = useState("");
  const [comments, setComments] = useState("");
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRedirect, setSuccessRedirect] = useState<string | null>(null);

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(accessToken!),
    enabled: !!accessToken && !!me?.departmentId,
  });

  const createMutation = useMutation({
    mutationFn: async (startImprovement: boolean) => {
      let beforePhotoUrls: string[] = [];
      if (photoFiles.length > 0) {
        setUploading(true);
        const uploaded = await Promise.all(
          photoFiles.map((file) => uploadImage(file, "kaizen", accessToken!)),
        );
        beforePhotoUrls = uploaded.map((u) => u.fileUrl);
        setUploading(false);
      }
      const selected = KAIZEN_TRIGGERS.find((t) => t.value === trigger);
      return KaizenService.create(
        {
          title: title.trim(),
          problem:
            trigger === "OTHER" ? triggerOther.trim() : (selected?.label ?? ""),
          trigger: trigger as KaizenTrigger,
          triggerOther: trigger === "OTHER" ? triggerOther.trim() : undefined,
          targetCompletionDate: new Date(targetCompletionDate).toISOString(),
          beforePhotoUrls,
          teamMemberIds: teamMemberIds.length ? teamMemberIds : undefined,
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
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (photoFiles.length + files.length > MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are allowed.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Each image must be under 10 MB.");
        return;
      }
    }
    setPhotoFiles((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const toggleTeamMember = (id: string) => {
    setTeamMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const submitKaizen = (startImprovement: boolean) => {
    const validationError = validate(
      title,
      trigger,
      triggerOther,
      targetCompletionDate,
      photoFiles,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    createMutation.mutate(startImprovement);
  };

  return (
    <ProtectedRoute
      allowedRoles={[
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.MANAGEMENT,
        Role.HOD,
        Role.HR,
        Role.EMPLOYEE,
      ]}
    >
      {successRedirect && (
        <SuccessModal onClose={() => router.push(successRedirect)} />
      )}

      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto">
        <Link
          href="/kaizen"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Kaizens
        </Link>

        <div className="mb-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Step 1 of 3 · Create Kaizen
          </p>
          <h1 className="text-2xl font-bold text-slate-900">New Kaizen</h1>
          <p className="text-sm text-slate-500 mt-1">
            Capture a workplace problem and a before photo to start your Gemba
            kaizen.
          </p>
        </div>

        <div className="mb-5">
          <KaizenStepper current={1} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitKaizen(false);
              }}
              className="space-y-6"
            >
              <div>
                <SectionLabel n={1}>Problem Details</SectionLabel>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Kaizen Title <span className="text-red-500">*</span>
                      </label>
                      <span
                        className={`text-xs ${title.length > TITLE_MAX ? "text-red-500" : "text-slate-400"}`}
                      >
                        {title.length}/{TITLE_MAX}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setError(null);
                      }}
                      placeholder="A short, descriptive title for this kaizen"
                      className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                      Why was this Daily Kaizen started?{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={trigger}
                      onChange={(e) => {
                        setTrigger(e.target.value as KaizenTrigger);
                        setError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    >
                      <option value="">Select a reason...</option>
                      {KAIZEN_TRIGGERS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {trigger === "OTHER" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-semibold text-slate-700">
                          Please explain <span className="text-red-500">*</span>
                        </label>
                        <span
                          className={`text-xs ${triggerOther.length > PROBLEM_MAX ? "text-red-500" : "text-slate-400"}`}
                        >
                          {triggerOther.length}/{PROBLEM_MAX}
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={triggerOther}
                        onChange={(e) => {
                          setTriggerOther(e.target.value);
                          setError(null);
                        }}
                        placeholder="Describe why this Daily Kaizen was started..."
                        className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all resize-none border-slate-200 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                      Target Completion Date{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={targetCompletionDate}
                      min={todayIsoDate()}
                      onChange={(e) => {
                        setTargetCompletionDate(e.target.value);
                        setError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Before Photos <span className="text-red-500">*</span>
                      </label>
                      <span className="text-xs text-slate-400">
                        {photoFiles.length}/{MAX_PHOTOS}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {photoPreviews.map((preview, i) => (
                        <div
                          key={preview}
                          className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview}
                            alt={`Before preview ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {photoFiles.length < MAX_PHOTOS && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
                        >
                          <ImagePlus className="h-5 w-5" />
                          Add photo
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
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
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform ${showMoreDetail ? "rotate-180" : ""}`}
                  />
                </button>
                {showMoreDetail && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Team Members{" "}
                          <span className="text-xs font-normal text-slate-400">
                            (optional, from your department)
                          </span>
                        </label>
                        {!me?.departmentId ? (
                          <p className="text-xs text-slate-400 border border-slate-200 rounded-lg px-4 py-2.5">
                            No department assigned.
                          </p>
                        ) : !colleagues || colleagues.length === 0 ? (
                          <p className="text-xs text-slate-400 border border-slate-200 rounded-lg px-4 py-2.5">
                            No other colleagues in your department yet.
                          </p>
                        ) : (
                          <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                            {colleagues.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={teamMemberIds.includes(c.id)}
                                  onChange={() => toggleTeamMember(c.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span>
                                  {c.firstName} {c.lastName}
                                  {c.jobTitle && (
                                    <span className="text-slate-400"> · {c.jobTitle}</span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Benefit Category{" "}
                          <span className="text-xs font-normal text-slate-400">
                            (optional)
                          </span>
                        </label>
                        <select
                          value={benefitCategory}
                          onChange={(e) => setBenefitCategory(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        >
                          <option value="">Select a category...</option>
                          {BENEFIT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                        Comments{" "}
                        <span className="text-xs font-normal text-slate-400">
                          (optional)
                        </span>
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
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  {error}
                </p>
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
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading
                      photo...
                    </>
                  ) : submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Start Improvement
                    </>
                  )}
                </button>
                <Link
                  href="/kaizen"
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>

          <SummaryPanel
            title="Kaizen Summary"
            rows={[
              {
                label: "Kaizen Owner",
                value: me ? `${me.firstName} ${me.lastName}` : "...",
              },
              {
                label: "Department",
                value: me?.department?.name ?? "No department",
              },
              { label: "Date", value: formatDate(new Date().toISOString()) },
              { label: "Status", value: "Draft" },
            ]}
          >
            <TipCallout>
              Describe the problem clearly and attach a before photo. You can
              save as a draft and come back later.
            </TipCallout>
          </SummaryPanel>
        </div>
      </div>
    </ProtectedRoute>
  );
}
