"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarOff, MapPin } from "lucide-react";
import { useTeam, useTeamMember } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateOnly, formatMinutes, formatTime, initials } from "@/lib/work/format";
import type { AttendanceTotals, TeamMember, TeamTodayStatus } from "@/services/work.service";
import { LocationCheckBadge, needsLocationAttention } from "@/components/work/attendance/LocationCheckBadge";
import { HomeRequestQueue } from "@/components/work/locations/HomeRequestQueue";
import { EmptyState, ErrorNote, Loading, Surface, TaskStatusBadge, WorkDialog, errorMessage, linkButton } from "@/components/work/ui";

const TODAY_LABELS: Record<TeamTodayStatus, { label: string; className: string }> = {
  CLOCKED_IN: { label: "In", className: "bg-emerald-50 text-emerald-800" },
  CLOCKED_OUT: { label: "Clocked out", className: "bg-slate-100 text-slate-700" },
  ON_LEAVE: { label: "On leave", className: "bg-blue-50 text-blue-800" },
  NOT_IN: { label: "Not in yet", className: "bg-amber-50 text-amber-800" },
  DAY_OFF: { label: "Day off", className: "bg-slate-100 text-slate-600" },
  HOLIDAY: { label: "Holiday", className: "bg-slate-100 text-slate-600" },
};

function rate(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
      {initials(name)}
    </span>
  );
}

function TodayBadge({ member, timeZone }: { member: TeamMember; timeZone: string }) {
  const { label, className } = TODAY_LABELS[member.today.status];
  const time = member.today.status === "CLOCKED_IN" && member.today.clockInAt ? ` since ${formatTime(member.today.clockInAt, timeZone)}` : "";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
      {time}
      {member.today.lateMinutes > 0 && ` · late ${formatMinutes(member.today.lateMinutes)}`}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-sm font-semibold ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

function AttendanceStats({ totals, withLocation = false }: { totals: AttendanceTotals; withLocation?: boolean }) {
  return (
    <>
      <Stat label="Clock-ins" value={totals.presentDays} />
      <Stat label="On time" value={rate(totals.punctualityRate)} />
      <Stat label="Late" value={totals.lateDays} tone={totals.lateDays > 0 ? "warn" : undefined} />
      <Stat label="Leave days" value={totals.leaveDays} />
      {withLocation && <Stat label="Outside location" value={totals.outsideLocationDays} tone={totals.outsideLocationDays > 0 ? "warn" : undefined} />}
    </>
  );
}

function MemberCard({ member, timeZone, onOpen }: { member: TeamMember; timeZone: string; onOpen: () => void }) {
  const nextLeave = member.leave[0];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="flex items-start gap-3">
          <Avatar name={member.name} url={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{member.name}</p>
            <p className="truncate text-sm text-slate-500">{member.jobTitle ?? member.department?.name ?? "—"}</p>
          </div>
          <TodayBadge member={member} timeZone={timeZone} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <AttendanceStats totals={member.attendance} />
          <Stat label="Open tasks" value={member.tasks.open} />
          <Stat label="Overdue" value={member.tasks.overdue} tone={member.tasks.overdue > 0 ? "warn" : undefined} />
        </dl>
        {member.attendance.outsideLocationDays > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {member.attendance.outsideLocationDays === 1 ? "1 clock-in" : `${member.attendance.outsideLocationDays} clock-ins`} outside approved locations this month
          </p>
        )}
        {nextLeave && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-600">
            <CalendarOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {nextLeave.type}: {formatDateOnly(nextLeave.startDate, { day: "numeric", month: "short" })}
            {nextLeave.endDate !== nextLeave.startDate && ` – ${formatDateOnly(nextLeave.endDate, { day: "numeric", month: "short" })}`}
          </p>
        )}
      </button>
    </li>
  );
}

function MemberDialog({ employeeId, timeZone, onClose }: { employeeId: string | null; timeZone: string; onClose: () => void }) {
  const detail = useTeamMember(employeeId);
  const member = detail.data;
  return (
    <WorkDialog
      open={employeeId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={member?.name ?? "Team member"}
      description={member ? (member.jobTitle ?? member.department?.name ?? undefined) : undefined}
      size="lg"
    >
      {detail.isPending ? (
        <Loading />
      ) : detail.isError ? (
        <ErrorNote>{errorMessage(detail.error, "Could not load this person.")}</ErrorNote>
      ) : member ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <TodayBadge member={member} timeZone={timeZone} />
            {member.email && <span className="text-sm text-slate-500">{member.email}</span>}
          </div>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">This month</h3>
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <AttendanceStats totals={member.attendance} withLocation />
            </dl>
            {member.attendance.averageLateMinutes > 0 && (
              <p className="mt-2 text-xs text-slate-500">Late by {formatMinutes(member.attendance.averageLateMinutes)} on average when late.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Last 14 days</h3>
            {member.recentAttendance.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No clock-ins.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {member.recentAttendance.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-slate-700">{formatDateOnly(r.workDate, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="text-slate-600">
                      {formatTime(r.clockInAt, timeZone)} – {r.clockOutAt ? formatTime(r.clockOutAt, timeZone) : "…"}
                      {r.lateMinutes > 0 && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Late {formatMinutes(r.lateMinutes)}</span>}
                      {r.earlyLeaveMinutes > 0 && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">Left {formatMinutes(r.earlyLeaveMinutes)} early</span>
                      )}
                      {needsLocationAttention(r.locationCheck) && (
                        <span className="ml-2">
                          <LocationCheckBadge check={r.locationCheck} distanceMeters={r.distanceMeters} placeName={r.checkedPlaceName} compact />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Open tasks</h3>
            {member.openTasks.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing open.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {member.openTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{t.title}</p>
                      <Link href={`/work/projects/${t.project.id}`} className={linkButton}>
                        {t.project.name}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.dueDate && <span className="text-xs text-slate-500">Due {formatDateOnly(t.dueDate, { day: "numeric", month: "short" })}</span>}
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {member.leave.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900">Leave in the next 14 days</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {member.leave.map((l) => (
                  <li key={`${l.type}-${l.startDate}`}>
                    {l.type}: {formatDateOnly(l.startDate, { day: "numeric", month: "short" })} – {formatDateOnly(l.endDate, { day: "numeric", month: "short" })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </WorkDialog>
  );
}

export default function TeamPage() {
  const team = useTeam();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">My Team</h1>
        <p className="mt-1 text-sm text-slate-500">People who report to you directly: who is in today, punctuality this month and their work.</p>
      </header>
      {team.isPending ? (
        <Loading />
      ) : team.isError ? (
        <ErrorNote>{errorMessage(team.error, "Could not load your team.")}</ErrorNote>
      ) : team.data.length === 0 ? (
        <Surface className="p-5">
          <EmptyState title="No direct reports">People appear here when their reporting manager is set to you in their employee profile.</EmptyState>
        </Surface>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {team.data.map((m) => (
            <MemberCard key={m.id} member={m} timeZone={timeZone} onOpen={() => setOpenId(m.id)} />
          ))}
        </ul>
      )}
      {team.data && team.data.length > 0 && <HomeRequestQueue hideWhenEmpty />}
      <MemberDialog employeeId={openId} timeZone={timeZone} onClose={() => setOpenId(null)} />
    </div>
  );
}
