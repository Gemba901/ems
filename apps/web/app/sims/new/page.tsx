"use client";

import { TenantImage } from "@/components/files/TenantImage";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService,
  SuggestionCategory,
  uploadSuggestionImage,
} from "@/services/sims.service";
import { EmployeeService } from "@/services/employee.service";
import { CommitteeService } from "@/services/committee.service";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SpeechToTextButton } from "@/components/ui/SpeechToTextButton";
import { ModuleTour, startTour } from "@/components/onboarding/ModuleTour";
import { SIMS_CREATE_TOUR } from "@/components/onboarding/tours";
import {
  Send,
  CheckSquare,
  Square,
  CheckCircle2,
  ImagePlus,
  Camera,
  X,
  Loader2,
  Compass,
} from "lucide-react";

const QCDSMT_CATEGORIES: {
  value: SuggestionCategory;
  label: string;
  summary: string;
  action: string;
  items: string[];
  selectedCls: string;
  labelColor: string;
  itemColor: string;
}[] = [
  {
    value: "QUALITY",
    label: "Quality",
    summary: "Better product, service, or work accuracy.",
    action: "Reduces",
    items: ["Defects", "Errors", "Rework", "Complaints"],
    selectedCls: "border-info bg-info-subtle",
    labelColor: "text-info",
    itemColor: "text-info",
  },
  {
    value: "COST",
    label: "Cost",
    summary: "Lower cost or better use of resources.",
    action: "Reduces",
    items: ["Waste", "Loss", "Overtime", "Energy"],
    selectedCls: "border-success bg-success-subtle",
    labelColor: "text-success",
    itemColor: "text-success",
  },
  {
    value: "DELIVERY",
    label: "Delivery",
    summary: "Faster and smoother workflow.",
    action: "Reduces",
    items: ["Delay", "Waiting", "Searching", "Lead time"],
    selectedCls: "border-warning bg-warning-subtle",
    labelColor: "text-warning",
    itemColor: "text-warning",
  },
  {
    value: "SAFETY",
    label: "Safety",
    summary: "Safer workplace with lower risk.",
    action: "Removes",
    items: ["Hazards", "Unsafe acts", "Injury risk"],
    selectedCls: "border-danger bg-danger-subtle",
    labelColor: "text-danger",
    itemColor: "text-danger",
  },
  {
    value: "MORALE",
    label: "Morale",
    summary: "Easier and better work for people.",
    action: "Reduces",
    items: ["Stress", "Confusion", "Frustration"],
    selectedCls: "border-danger bg-danger-subtle",
    labelColor: "text-danger",
    itemColor: "text-danger",
  },
  {
    value: "TECHNOLOGY",
    label: "Technology",
    summary: "Better tools, systems, data, or digital work.",
    action: "Improves",
    items: ["Software", "Automation", "Dashboards", "Tracking"],
    selectedCls: "border-border bg-muted",
    labelColor: "text-foreground",
    itemColor: "text-muted-foreground",
  },
];

const ALL_QCDSMT: SuggestionCategory[] = QCDSMT_CATEGORIES.map((c) => c.value);

const FIVE_W2H: { key: string; desc: string }[] = [
  { key: "What", desc: "What problem or improvement opportunity do you see?" },
  {
    key: "Where",
    desc: "Where is it happening? Department, line, machine, area, or process.",
  },
  {
    key: "When",
    desc: "When does it happen? Shift, time, frequency, or situation.",
  },
  {
    key: "Who",
    desc: "Who is affected? Operator, supervisor, customer, team, or department.",
  },
  {
    key: "Why",
    desc: "Why is it important? Delay, waste, defect, risk, confusion, or extra cost.",
  },
  { key: "How", desc: "How can it be improved? Suggest a practical solution." },
  {
    key: "How Much",
    desc: "What impact is expected? Time saving, cost saving, waste reduction, risk reduction, or easier work.",
  },
];

const EXAMPLE = {
  context:
    "Truck loading and offloading takes too much time because cartons are handled manually.",
  suggestion:
    "Use a movable conveyor that can go inside the truck or container. Barcode scanning or sensors can also be added for dispatch control.",
  impact: [
    {
      cat: "Delivery",
      note: "Reduces loading and offloading time.",
      color: "text-warning",
    },
    {
      cat: "Morale",
      note: "Reduces hard manual work for the team.",
      color: "text-danger",
    },
    {
      cat: "Quality",
      note: "Reduces carton damage and wrong dispatch.",
      color: "text-info",
    },
    {
      cat: "Technology",
      note: "Supports barcode or sensor-based control.",
      color: "text-muted-foreground",
    },
  ],
};

const AUTO_CLOSE_MS = 6000;

function SuccessModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    const startedAt = performance.now();
    let frame: number;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        onClose();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onClose]);

  const firstName = name.split(" ")[0];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <CheckCircle2 aria-hidden="true" className="size-8 text-success" />
          <DialogTitle>Thank you, {firstName}!</DialogTitle>
          <DialogDescription>
            Your suggestion has been submitted for review.
          </DialogDescription>
        </DialogHeader>
        <Button type="button" onClick={onClose}>
          OK
        </Button>
        <div
          aria-hidden="true"
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${progress}%` }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TITLE_MIN = 10;
const TITLE_MAX = 200;
const DESC_MIN = 20;
const DESC_MAX = 2000;

function validate(
  title: string,
  description: string,
  categories: SuggestionCategory[],
  isPrivileged: boolean,
  hodId: string,
  committeeId: string,
) {
  if (title.trim().length < TITLE_MIN)
    return `Title must be at least ${TITLE_MIN} characters.`;
  if (title.trim().length > TITLE_MAX)
    return `Title must be under ${TITLE_MAX} characters.`;
  if (description.trim().length < DESC_MIN)
    return `Description must be at least ${DESC_MIN} characters.`;
  if (description.trim().length > DESC_MAX)
    return `Description must be under ${DESC_MAX} characters.`;
  if (categories.length === 0) return "Please select at least one category.";
  if (isPrivileged && !hodId && !committeeId)
    return "Please select who this suggestion should go to.";
  return null;
}

const PRIVILEGED_ROLES = [
  Role.HOD,
  Role.MANAGEMENT,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

export default function NewSuggestionPage() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();

  const isPrivileged = user ? PRIVILEGED_ROLES.includes(user.roleLevel) : false;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<SuggestionCategory[]>([]);
  const [hodId, setHodId] = useState<string>("");
  const [committeeId, setCommitteeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successRedirect, setSuccessRedirect] = useState<string | null>(null);
  const submissionStarted = useRef(false);
  const successHandled = useRef(false);
  const openSubmittedSuggestion = useCallback(() => {
    if (!successRedirect || successHandled.current) return;
    successHandled.current = true;
    router.push(successRedirect);
  }, [router, successRedirect]);

  const { data: departmentHODs = [] } = useQuery({
    queryKey: ["department-hods", user?.organizationId],
    queryFn: () =>
      EmployeeService.getDepartmentHODs(user!.organizationId!, accessToken!),
    enabled: isPrivileged && !!user?.organizationId && !!accessToken,
  });

  const { data: routableCommittees = [] } = useQuery({
    queryKey: ["committees-routable"],
    queryFn: () => CommitteeService.listRoutable(accessToken!),
    enabled: isPrivileged && !!accessToken,
  });

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      categories: SuggestionCategory[];
      isAnonymous: boolean;
      imageFile: File | null;
      hodId?: string;
      committeeId?: string;
    }) => {
      let imageUrl: string | undefined;
      if (payload.imageFile) {
        setImageUploading(true);
        imageUrl = await uploadSuggestionImage(payload.imageFile, accessToken!);
        setImageUploading(false);
      }
      return SimsService.submit(
        {
          title: payload.title,
          description: payload.description,
          categories: payload.categories,
          isAnonymous: payload.isAnonymous,
          imageUrl,
          hodId: payload.hodId,
          committeeId: payload.committeeId,
        },
        accessToken!,
      );
    },
    onSuccess: (created) => {
      setSuccessRedirect(`/sims/${created.id}`);
    },
    onError: (err: unknown) => {
      submissionStarted.current = false;
      setImageUploading(false);
      setError(err instanceof Error ? err.message : "Submission failed");
    },
  });

  const submitting = submitMutation.isPending;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  // Speech-to-text handlers
  const appendToTitle = useCallback((transcript: string) => {
    setTitle((prev) =>
      (prev ? `${prev} ${transcript}` : transcript).slice(0, TITLE_MAX),
    );
    setError(null);
  }, []);

  const appendToDescription = useCallback((transcript: string) => {
    setDescription((prev) =>
      (prev ? `${prev} ${transcript}` : transcript).slice(0, DESC_MAX),
    );
    setError(null);
  }, []);

  const toggleCategory = (val: SuggestionCategory) => {
    setCategories((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val],
    );
  };

  const selectAll = () => {
    setCategories(ALL_QCDSMT);
  };

  const selectUnknown = () => {
    setCategories(["UNKNOWN"]);
  };

  const clearCategories = () => setCategories([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionStarted.current) return;
    const validationError = validate(
      title,
      description,
      categories,
      isPrivileged,
      hodId,
      committeeId,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!accessToken) return;

    submissionStarted.current = true;
    setError(null);
    submitMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      categories,
      isAnonymous: false,
      imageFile,
      hodId: isPrivileged && hodId ? hodId : undefined,
      committeeId: isPrivileged && committeeId ? committeeId : undefined,
    });
  };

  // "Send To" is a single dropdown covering both destinations — values are prefixed
  // (hod:/committee:) so one onChange can set whichever target state applies and clear the other.
  const sendToValue = hodId
    ? `hod:${hodId}`
    : committeeId
      ? `committee:${committeeId}`
      : "";
  const handleSendToChange = (value: string) => {
    setError(null);
    if (value.startsWith("hod:")) {
      setHodId(value.slice(4));
      setCommitteeId("");
    } else if (value.startsWith("committee:")) {
      setCommitteeId(value.slice(10));
      setHodId("");
    } else {
      setHodId("");
      setCommitteeId("");
    }
  };

  const isUnknownSelected = categories.includes("UNKNOWN");
  const canSubmit =
    !submitting &&
    !successRedirect &&
    categories.length > 0 &&
    title.trim().length >= TITLE_MIN &&
    description.trim().length >= DESC_MIN &&
    (!isPrivileged || !!hodId || !!committeeId);

  return (
    <ProtectedRoute
      allowedRoles={[
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.MANAGEMENT,
        Role.HOD,
        Role.EMPLOYEE,
      ]}
    >
      {successRedirect && (
        <SuccessModal
          name={user?.name ?? "there"}
          onClose={openSubmittedSuggestion}
        />
      )}
      <div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-section">
          <div className="min-w-0 space-y-section xl:col-span-2">
            <ModuleTour tourId="sims-create" steps={SIMS_CREATE_TOUR} />
            <PageHeader
              title="New Suggestion"
              breadcrumbs={[
                { label: "Suggestions", href: "/sims" },
                { label: "New" },
              ]}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startTour("sims-create")}
                >
                  <Compass aria-hidden="true" data-icon="inline-start" /> Show
                  me how
                </Button>
              }
            />

            <div className="bg-background border border-border rounded-xl p-6">
              <form
                onSubmit={handleSubmit}
                aria-label="New Suggestion"
                aria-busy={submitting}
              >
                <fieldset
                  disabled={submitting || !!successRedirect}
                  className="min-w-0 space-y-section"
                >
                  {/* HOD picker — only for HOD / Management / Admin */}
                  {isPrivileged && (
                    <div data-tour="sims-send-to">
                      <Label htmlFor="sims-send-to">
                        Send To <span className="text-danger">*</span>
                      </Label>
                      <NativeSelect
                        id="sims-send-to"
                        value={sendToValue}
                        onChange={(e) => handleSendToChange(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all bg-background ${
                          !sendToValue
                            ? "border-border focus:ring-ring/20 focus:border-primary text-muted-foreground"
                            : "border-border focus:ring-ring/20 focus:border-primary text-foreground"
                        }`}
                      >
                        <option value="">Select who this goes to…</option>
                        {departmentHODs.length > 0 && (
                          <optgroup label="Departments">
                            {departmentHODs.map((h) => (
                              <option key={h.id} value={`hod:${h.id}`}>
                                {h.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {routableCommittees.length > 0 && (
                          <optgroup label="Committees">
                            {routableCommittees.map((c) => (
                              <option key={c.id} value={`committee:${c.id}`}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </NativeSelect>
                      <p className="text-xs text-muted-foreground mt-1">
                        {committeeId
                          ? "Your suggestion will be sent straight to this committee for review."
                          : "Your suggestion will be directed to this person's department for review."}
                      </p>
                    </div>
                  )}

                  {/* Title */}
                  <div data-tour="sims-title">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="sims-title">
                        Problem Identified{" "}
                        <span className="text-danger">*</span>
                      </Label>
                      <span
                        className={`text-xs ${title.length > TITLE_MAX ? "text-danger" : "text-muted-foreground"}`}
                      >
                        {title.length}/{TITLE_MAX}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="sims-title"
                        type="text"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setError(null);
                        }}
                        placeholder="e.g., Reduce rework rate in the Assembly line"
                        className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                          title.length > 0 && title.length < TITLE_MIN
                            ? "border-warning focus:ring-ring/20 focus:border-warning"
                            : "border-border focus:ring-ring/20 focus:border-primary"
                        }`}
                      />
                      <span data-tour="sims-voice" className="inline-flex">
                        <SpeechToTextButton
                          onResult={appendToTitle}
                          disabled={submitting}
                        />
                      </span>
                    </div>
                    {title.length > 0 && title.length < TITLE_MIN && (
                      <p className="text-xs text-warning mt-1">
                        {TITLE_MIN - title.length} more characters needed
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div data-tour="sims-description">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="sims-description">
                        My Suggestion for Improvement{" "}
                        <span className="text-danger">*</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs ${description.length > DESC_MAX ? "text-danger" : "text-muted-foreground"}`}
                        >
                          {description.length}/{DESC_MAX}
                        </span>
                        <SpeechToTextButton
                          onResult={appendToDescription}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <Textarea
                      id="sims-description"
                      rows={6}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setError(null);
                      }}
                      placeholder="Describe the current problem and your proposed solution. Be specific, include estimated cost or time savings where possible."
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all resize-none ${
                        description.length > 0 && description.length < DESC_MIN
                          ? "border-warning focus:ring-ring/20 focus:border-warning"
                          : "border-border focus:ring-ring/20 focus:border-primary"
                      }`}
                    />
                    {description.length > 0 &&
                      description.length < DESC_MIN && (
                        <p className="text-xs text-warning mt-1">
                          {DESC_MIN - description.length} more characters needed
                        </p>
                      )}
                  </div>

                  {/* Image upload */}
                  <div data-tour="sims-image">
                    <label className="text-sm font-semibold text-foreground block mb-1.5">
                      Supporting Image{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </label>
                    {imagePreview ? (
                      <div className="relative w-full rounded-xl overflow-hidden border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <TenantImage
                          src={imagePreview}
                          alt="Preview"
                          className="w-full max-h-60 object-contain"
                        />
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={removeImage}
                          aria-label="Remove supporting image"
                          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-overlay/60 hover:bg-overlay/80 flex items-center justify-center text-primary-foreground transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-5 text-sm text-muted-foreground hover:border-info hover:text-info transition-all"
                        >
                          <ImagePlus className="h-4 w-4" />
                          Click to attach an image
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-5 text-sm text-muted-foreground hover:border-info hover:text-info transition-all"
                        >
                          <Camera className="h-4 w-4" />
                          Take a photo
                        </Button>
                      </div>
                    )}
                    <Input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <Input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>

                  {/* Category multi-select */}
                  <div data-tour="sims-category">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-foreground">
                        Category <span className="text-danger">*</span>
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Select all that apply
                        </span>
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={selectAll}
                          className="text-info hover:underline"
                        >
                          All
                        </Button>
                        <span className="text-muted-foreground">·</span>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={selectUnknown}
                          className="text-muted-foreground hover:underline"
                        >
                          I don’t know
                        </Button>
                        {categories.length > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={clearCategories}
                              className="text-danger hover:underline"
                            >
                              Clear
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* QCDSMT grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {QCDSMT_CATEGORIES.map((cat) => {
                        const selected = categories.includes(cat.value);
                        return (
                          <Button
                            variant="ghost"
                            key={cat.value}
                            type="button"
                            onClick={() => {
                              if (!isUnknownSelected) toggleCategory(cat.value);
                            }}
                            disabled={isUnknownSelected}
                            aria-pressed={selected}
                            className={`relative flex h-auto w-full justify-start items-start whitespace-normal gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                              isUnknownSelected
                                ? "border-border bg-muted opacity-40 cursor-not-allowed"
                                : selected
                                  ? `${cat.selectedCls} border-opacity-100`
                                  : `border-border bg-background hover:border-border`
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {selected ? (
                                <CheckSquare
                                  className={`h-3.5 w-3.5 ${cat.labelColor}`}
                                />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-bold leading-none mb-1 ${selected ? cat.labelColor : "text-foreground"}`}
                              >
                                {cat.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-snug mb-1">
                                {cat.summary}
                              </p>
                              <p
                                className={`text-[9px] leading-snug ${selected ? cat.itemColor : "text-muted-foreground"}`}
                              >
                                {cat.action}: {cat.items.join(" · ")}
                              </p>
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    {/* "I don’t know" pill */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        isUnknownSelected ? clearCategories() : selectUnknown()
                      }
                      aria-pressed={isUnknownSelected}
                      className={`mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all ${
                        isUnknownSelected
                          ? "border-border bg-muted text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-border"
                      }`}
                    >
                      {isUnknownSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="text-xs font-medium">
                        I don’t know which category applies
                      </span>
                    </Button>

                    {categories.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Selected:{" "}
                        <span className="font-medium text-foreground">
                          {isUnknownSelected
                            ? "Unknown"
                            : categories
                                .map(
                                  (c) => c.charAt(0) + c.slice(1).toLowerCase(),
                                )
                                .join(", ")}
                        </span>
                      </p>
                    )}
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="text-sm text-danger bg-danger-subtle border border-danger/25 rounded-xl px-4 py-3"
                    >
                      {error}
                    </p>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="default"
                      type="submit"
                      data-tour="sims-submit"
                      disabled={!canSubmit}
                      className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {imageUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading
                          image...
                        </>
                      ) : submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" /> Submit Suggestion
                        </>
                      )}
                    </Button>
                    <Link
                      href="/sims"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Cancel
                    </Link>
                  </div>
                </fieldset>
              </form>
            </div>
          </div>

          {/* RIGHT — Submission Guide */}
          <div className="xl:col-span-1">
            <div
              data-tour="sims-tips"
              className="bg-background border border-border rounded-xl overflow-hidden sticky top-6"
            >
              <div className="px-5 py-4 border-b border-border bg-muted">
                <p className="text-sm font-bold text-foreground">
                  Writing tips & example
                </p>
              </div>

              <div className="overflow-y-auto max-h-[calc(100vh-10rem)] divide-y divide-border">
                {/* Section 1 — How to Write a Good Suggestion */}
                <div className="px-5 py-4">
                  {/* <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">How to Write a Good Suggestion</p> */}
                  <p className="text-xs text-muted-foreground mb-3">
                    A good suggestion should be{" "}
                    <span className="font-semibold text-foreground">
                      simple, clear, and useful
                    </span>
                    . It should explain the problem, the suggested improvement,
                    and the expected impact.
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Try to cover{" "}
                    <span className="font-semibold text-foreground">5W2H</span>{" "}
                    where possible:
                  </p>
                  <div className="space-y-2">
                    {FIVE_W2H.map((w) => (
                      <div key={w.key} className="flex gap-2">
                        <span className="text-[11px] font-bold text-foreground shrink-0 w-14">
                          {w.key}
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-relaxed">
                          {w.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2 — Example */}
                <div className="px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Example
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    {EXAMPLE.context}
                  </p>
                  <p className="text-xs text-foreground mb-2">
                    <span className="font-semibold">Suggestion:</span>{" "}
                    {EXAMPLE.suggestion}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    Expected Impact:
                  </p>
                  <div className="space-y-1">
                    {EXAMPLE.impact.map((imp) => (
                      <div
                        key={imp.cat}
                        className="flex gap-1.5 items-baseline"
                      >
                        <span
                          className={`text-[10px] font-bold shrink-0 ${imp.color}`}
                        >
                          {imp.cat}
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-relaxed">
                          {imp.note}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
