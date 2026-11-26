"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { TenantImage } from "@/components/files/TenantImage";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { useOrgModules } from "@/hooks/useOrgModules";
import { useToast } from "@/contexts/toast.context";
import {
  EmsService, EmployeeProfile, CompletionResult, Reportee, PublicHoliday,
  GROUP_LABELS, GroupKey, EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, SKILL_LEVEL_LABELS,
  completionColor, completionBg,
} from "@/services/ems.service";
import { EmployeeService } from "@/services/employee.service";
import { uploadImage } from "@/services/uploads.service";
import { LeaveService, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { Loader2, Camera, Mail, Phone, Hash, CalendarDays } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type Tab = "overview" | "profile" | "leave" | "committees";

const GENDER_LABELS = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initialsOf(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function parseLocalDate(date: string) {
  // Holidays are plain YYYY-MM-DD strings; parse as local dates so the weekday doesn't shift.
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function yearsOfService(dateJoined: string | null) {
  if (!dateJoined) return null;
  const years = (Date.now() - new Date(dateJoined).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} mo`;
  return `${years.toFixed(1)} yrs`;
}

// ── Building blocks ───────────────────────────────────────────────────────────

function Avatar({
  src, firstName, lastName, className,
}: { src?: string | null; firstName: string; lastName: string; className: string }) {
  if (src) {
    return <TenantImage src={src} alt={`${firstName} ${lastName}`} className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground`}>
      {initialsOf(firstName, lastName)}
    </span>
  );
}

function Panel({ title, action, children, bodyClassName = "p-5" }: {
  title: string; action?: ReactNode; children: ReactNode; bodyClassName?: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${empty ? "text-muted-foreground" : "text-foreground"}`}>{empty ? "—" : value}</dd>
    </div>
  );
}

function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>
    </Panel>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function ProfilePhoto({ employee }: { employee: EmployeeProfile }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const { fileUrl } = await uploadImage(file, "avatars", accessToken!);
      return EmployeeService.updateAvatar(employee.id, fileUrl, accessToken!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-me"] });
      toast("Profile photo updated", "success");
    },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : "Couldn't update your photo", "error"),
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return toast("Use a JPG, PNG or WebP image", "error");
    if (file.size > AVATAR_MAX_BYTES) return toast("Photo must be 5 MB or smaller", "error");
    mutation.mutate(file);
  };

  return (
    <div className="shrink-0">
      <Button variant="ghost"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
        aria-label="Change profile photo"
        title="Change profile photo"
        className="group relative block h-auto w-auto rounded-full p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar src={employee.avatarUrl} firstName={employee.firstName} lastName={employee.lastName} className="h-20 w-20 text-xl" />
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-full bg-overlay/50 transition-opacity ${
            mutation.isPending ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
        >
          {mutation.isPending
            ? <Loader2 className="h-5 w-5 animate-spin text-background dark:text-foreground" />
            : <Camera className="h-5 w-5 text-background dark:text-foreground" />}
        </span>
      </Button>
      <Input ref={inputRef} type="file" accept={AVATAR_TYPES.join(",")} className="hidden" onChange={onFile} />
    </div>
  );
}

function ProfileHeader({
  employee, tabs,
}: { employee: EmployeeProfile; tabs: { key: Tab; label: string }[] }) {
  const statusDot =
    employee.employmentStatus === "ACTIVE" ? "bg-success"
    : employee.employmentStatus === "PROBATION" ? "bg-warning"
    : "bg-muted-foreground";
  const subtitle = [employee.jobTitle, employee.department?.name].filter(Boolean).join(" · ");

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <ProfilePhoto employee={employee} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-page-title">
              {employee.firstName} {employee.lastName}
            </h1>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${statusDot}`} />
              {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
            </span>
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {employee.employeeCode && (
              <li className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />{employee.employeeCode}</li>
            )}
            {employee.email && (
              <li className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{employee.email}</span></li>
            )}
            {employee.phone && (
              <li className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{employee.phone}</li>
            )}
            {employee.dateJoined && (
              <li className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Joined {formatDate(employee.dateJoined)}</li>
            )}
          </ul>
        </div>
      </div>
      <TabsList variant="line" aria-label="Profile sections" className="w-full justify-start overflow-x-auto border-t border-border px-5 sm:px-6">
        {tabs.map(({ key, label }) => (
          <TabsTrigger key={key} value={key} className="flex-none px-3">{label}</TabsTrigger>
        ))}
      </TabsList>
    </section>
  );
}

// ── Side column ───────────────────────────────────────────────────────────────

function PersonRow({ person, detail }: {
  person: { firstName: string; lastName: string; avatarUrl?: string | null }; detail?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar src={person.avatarUrl} firstName={person.firstName} lastName={person.lastName} className="h-9 w-9 text-xs" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{person.firstName} {person.lastName}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function ReportingPanel({ manager, reportees, total }: {
  manager: EmployeeProfile["reportingManager"]; reportees: Reportee[]; total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? reportees : reportees.slice(0, 3);
  const hidden = total - shown.length;
  return (
    <Panel title="Reporting line">
      <p className="mb-2 text-xs text-muted-foreground">Reports to</p>
      {manager ? <PersonRow person={manager} detail={manager.jobTitle} /> : <p className="text-sm text-muted-foreground">No manager assigned</p>}

      {total > 0 && (
        <>
          <p className="mb-2 mt-5 text-xs text-muted-foreground">Direct reports ({total})</p>
          <ul className="space-y-3">
            {shown.map((person) => (
              <li key={person.id}><PersonRow person={person} detail={person.jobTitle} /></li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && (
            <Button variant="ghost"
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-3 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {expanded ? "Show less" : `Show ${hidden} more`}
            </Button>
          )}
          {expanded && total > reportees.length && (
            <p className="mt-1 text-xs text-muted-foreground">Showing the first {reportees.length}.</p>
          )}
        </>
      )}
    </Panel>
  );
}

function CompletenessPanel({ completion }: { completion: CompletionResult }) {
  return (
    <Panel
      title="Record completeness"
      action={<span className={`text-sm font-semibold tabular-nums ${completionColor(completion.overall)}`}>{completion.overall}%</span>}
    >
      <ul className="space-y-3">
        {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
          const pct = completion.groups[key] ?? 0;
          return (
            <li key={key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{GROUP_LABELS[key]}</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${completionBg(pct)}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {completion.overall < 90 && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Some details are missing. Ask HR to update your record.
        </p>
      )}
    </Panel>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function WeekPanel({
  shift, workingDays, holidays,
}: { shift: string | null; workingDays: number[]; holidays: PublicHoliday[] }) {
  const days = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, []);
  const todayKey = toDateKey(new Date());
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));
  const workingLabel = workingDays.length ? [...workingDays].sort().map((d) => DAY_NAMES[d]).join(", ") : "—";

  return (
    <Panel
      title="This week"
      action={<span className="text-xs text-muted-foreground">{formatDate(days[0].toISOString())} – {formatDate(days[6].toISOString())}</span>}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{shift ?? "General shift"}</span>
        <span className="text-muted-foreground"> · </span>
        {workingLabel}
      </p>
      <ol className="grid grid-cols-7 overflow-hidden rounded-md border border-border text-center">
        {days.map((day) => {
          const key = toDateKey(day);
          const isToday = key === todayKey;
          const holiday = holidayByDate.get(key);
          const working = workingDays.includes(day.getDay());
          const note = holiday ? "Holiday" : !working ? "Off" : "";
          return (
            <li
              key={key}
              title={holiday}
              className={`border-l border-border px-1 py-2.5 first:border-l-0 ${
                isToday ? "bg-primary text-primary-foreground" : !working || holiday ? "bg-muted text-muted-foreground" : "text-foreground"
              }`}
            >
              <p className={`text-xs ${isToday ? "text-muted-foreground" : "text-muted-foreground"}`}>{DAY_NAMES[day.getDay()]}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{day.getDate()}</p>
              <p className="min-h-4 text-[11px]">{note}</p>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function HolidaysPanel({ holidays }: { holidays: PublicHoliday[] }) {
  return (
    <Panel title="Upcoming holidays" bodyClassName="">
      {holidays.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No upcoming public holidays.</p>
      ) : (
        <ul className="divide-y divide-border">
          {holidays.map((holiday) => {
            const date = parseLocalDate(holiday.date);
            return (
              <li key={holiday.date} className="flex items-center gap-4 px-5 py-3">
                <div className="w-10 shrink-0 text-center">
                  <p className="text-[11px] uppercase text-muted-foreground">{date.toLocaleDateString("en-GB", { month: "short" })}</p>
                  <p className="text-lg font-semibold leading-tight tabular-nums text-foreground">{date.getDate()}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{holiday.name}</p>
                  <p className="text-xs text-muted-foreground">{date.toLocaleDateString("en-GB", { weekday: "long", year: "numeric" })}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileDetails({ employee }: { employee: EmployeeProfile }) {
  const person = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);
  return (
    <div className="space-y-5">
      <FieldSection title="Basic identity">
        <Field label="Employee code" value={employee.employeeCode} />
        <Field label="Full name" value={[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")} />
        <Field label="Gender" value={employee.gender ? GENDER_LABELS[employee.gender] : null} />
        <Field label="Date of birth" value={formatDate(employee.dateOfBirth)} />
        <Field label="National ID" value={employee.nationalId} />
        <Field label="Nationality" value={employee.nationality} />
      </FieldSection>
      <FieldSection title="Work allocation">
        <Field label="Department" value={employee.department?.name} />
        <Field label="Job title" value={employee.jobTitle} />
        <Field label="Employment status" value={EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]} />
        <Field label="Employment type" value={employee.employmentType ? EMPLOYMENT_TYPE_LABELS[employee.employmentType] : null} />
        <Field label="Date joined" value={formatDate(employee.dateJoined)} />
        <Field label="Service" value={yearsOfService(employee.dateJoined)} />
        <Field label="Plant / branch" value={employee.plantBranch} />
        <Field label="Work station" value={employee.workStation} />
        <Field label="Section" value={[employee.section, employee.subSection].filter(Boolean).join(" / ")} />
        <Field label="Shift" value={employee.shift} />
        <Field label="Reporting manager" value={person(employee.reportingManager)} />
        <Field label="HR record owner" value={person(employee.hrRecordOwner)} />
      </FieldSection>
      <FieldSection title="Role & responsibility">
        <Field label="Level" value={employee.level} />
        <Field label="Grade" value={employee.grade} />
        <Field label="Job category" value={employee.jobCategory} />
        <Field label="Primary work role" value={employee.primaryWorkRole} />
        <Field label="Machine / process" value={employee.machineProcess} />
        <Field
          label="Eligible as"
          value={[
            employee.canBeAssignedTasks && "Task assignee",
            employee.canBeMember && "Team member",
            employee.canBeLeader && "Team leader",
          ].filter(Boolean).join(", ")}
        />
        <div className="sm:col-span-2">
          <Field label="Job description" value={employee.jobDescription} />
        </div>
      </FieldSection>
      <FieldSection title="Contact">
        <Field label="Email" value={employee.email} />
        <Field label="Phone" value={employee.phone} />
        <Field label="WhatsApp" value={employee.whatsappNumber} />
        <Field label="Home address" value={employee.homeAddress} />
        <Field label="Emergency contact" value={employee.emergencyContactName} />
        <Field
          label="Emergency phone"
          value={[employee.emergencyContactPhone, employee.emergencyContactRelationship && `(${employee.emergencyContactRelationship})`].filter(Boolean).join(" ")}
        />
      </FieldSection>
      <FieldSection title="Skill">
        <Field label="Skill level" value={employee.skillLevel ? SKILL_LEVEL_LABELS[employee.skillLevel] : null} />
        <Field label="Training needed" value={employee.trainingNeeded === null ? null : employee.trainingNeeded ? "Yes" : "No"} />
      </FieldSection>
      <p className="text-xs text-muted-foreground">These details are managed by HR. Contact them to make changes.</p>
    </div>
  );
}

// ── Leave tab ─────────────────────────────────────────────────────────────────

function LeaveBalances() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ["leave-balance", "me"],
    queryFn: () => LeaveService.getMyBalance(accessToken!),
    enabled: !!accessToken,
  });
  return (
    <Panel
      title={`Leave balance ${new Date().getFullYear()}`}
      bodyClassName=""
      action={
        <Link href="/leave/apply" className="text-sm font-medium text-primary hover:underline">
          Apply for leave
        </Link>
      }
    >
      {isLoading ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : balances.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No leave allocated yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border text-left text-xs text-muted-foreground">
                <TableHead className="px-5 py-2.5 font-medium">Type</TableHead>
                <TableHead className="px-5 py-2.5 text-right font-medium">Available</TableHead>
                <TableHead className="px-5 py-2.5 text-right font-medium">Used</TableHead>
                <TableHead className="px-5 py-2.5 text-right font-medium">Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {balances.map((balance) => (
                <TableRow key={balance.id}>
                  <TableCell className="px-5 py-3 text-foreground">{LEAVE_TYPE_LABELS[balance.type] ?? balance.type}</TableCell>
                  <TableCell className="px-5 py-3 text-right font-semibold tabular-nums text-foreground">{balance.allocated - balance.used}</TableCell>
                  <TableCell className="px-5 py-3 text-right tabular-nums text-muted-foreground">{balance.used}</TableCell>
                  <TableCell className="px-5 py-3 text-right tabular-nums text-muted-foreground">{balance.allocated}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

// ── Committees tab ────────────────────────────────────────────────────────────

function Committees({ memberships }: { memberships: EmployeeProfile["committeeMembers"] }) {
  return (
    <Panel title="Committee memberships" bodyClassName="">
      <ul className="divide-y divide-border">
        {memberships.map((membership) => (
          <li key={membership.committee.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{membership.committee.name}</p>
              <p className="text-xs text-muted-foreground">{membership.committee.type}</p>
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">{membership.roleInCommittee ?? "Member"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MyProfileView() {
  const { accessToken } = useAuthStore();
  const { hasModule } = useOrgModules();
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-my-profile"],
    queryFn: () => EmsService.getMyProfile(accessToken!),
    enabled: !!accessToken,
  });

  const employee = data?.employee ?? null;
  const completion = data?.completion ?? null;
  const error = queryError instanceof Error ? queryError.message : null;

  const tabs = [
    { key: "overview" as const, label: "Overview", show: true },
    { key: "profile" as const, label: "Profile", show: true },
    { key: "leave" as const, label: "Leave", show: hasModule("LEAVE") },
    { key: "committees" as const, label: "Committees", show: (employee?.committeeMembers.length ?? 0) > 0 },
  ].filter((t) => t.show);

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <div role="alert" className="rounded-lg border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div>}

      {employee && completion && (
        <Tabs
          value={tabs.some(({ key }) => key === tab) ? tab : "overview"}
          onValueChange={(value) => setTab(value as Tab)}
          className="gap-5"
        >
          <ProfileHeader employee={employee} tabs={tabs} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <TabsContent value="overview" className="space-y-5">
                <WeekPanel
                  shift={employee.shift}
                  workingDays={data?.workingDays ?? [1, 2, 3, 4, 5]}
                  holidays={data?.upcomingHolidays ?? []}
                />
                <HolidaysPanel holidays={data?.upcomingHolidays ?? []} />
              </TabsContent>
              <TabsContent value="profile"><ProfileDetails employee={employee} /></TabsContent>
              {tabs.some(({ key }) => key === "leave") && (
                <TabsContent value="leave"><LeaveBalances /></TabsContent>
              )}
              {tabs.some(({ key }) => key === "committees") && (
                <TabsContent value="committees"><Committees memberships={employee.committeeMembers} /></TabsContent>
              )}
            </div>

            <aside className="space-y-5">
              <ReportingPanel
                manager={employee.reportingManager}
                reportees={data?.reportees ?? []}
                total={data?.reporteeCount ?? 0}
              />
              <CompletenessPanel completion={completion} />
            </aside>
          </div>
        </Tabs>
      )}
    </ProtectedRoute>
  );
}
