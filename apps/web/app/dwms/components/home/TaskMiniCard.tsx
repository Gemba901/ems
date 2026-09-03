import { useEffect, useRef, useState } from 'react';
import type { DwmsTaskItem as TaskItem, DwmsTaskStatus as TaskStatus } from '@/services/dwms.service';
import { ArrowUp, Minus, Repeat, Clock, CheckCircle, ChevronDown } from 'lucide-react';
import {
  formatOrganizationDate,
  isTodayInOrganizationTimeZone,
} from '../../utils/organizationDate';

type Props = {
  task: TaskItem;
  onClick: (task: TaskItem) => void;
  onStatusChange: (instanceId: string, nextStatus: TaskStatus) => void;
  onAcknowledgement: (taskId: string) => void;
  saving: boolean;
};

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getTimeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(partMap.get('year')),
    Number(partMap.get('month')) - 1,
    Number(partMap.get('day')),
    Number(partMap.get('hour')),
    Number(partMap.get('minute')),
    Number(partMap.get('second')),
    value.getUTCMilliseconds(),
  );

  return zonedAsUtc - value.getTime();
}

function startOfDayInTimeZone(value: Date, timeZone: string): Date {
  const localStartAsUtc = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const firstPass = new Date(
    localStartAsUtc - getTimeZoneOffsetMs(new Date(localStartAsUtc), timeZone),
  );
  const offset = getTimeZoneOffsetMs(firstPass, timeZone);
  return new Date(localStartAsUtc - offset);
}

function getTaskTimeZone(task: TaskItem) {
  return task.organizationTimeZone;
}

function getCompletionWindowStart(task: TaskItem): Date | null {
  const scheduledFor = new Date(task.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) return null;

  const date = toUtcDateOnly(scheduledFor);
  const timeZone = getTaskTimeZone(task);
  switch (task.frequency) {
    case 'DAILY':
      return startOfDayInTimeZone(date, timeZone);
    case 'WEEKLY': {
      const start = new Date(date);
      const mondayOffset = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - mondayOffset);
      return startOfDayInTimeZone(start, timeZone);
    }
    case 'MONTHLY':
      return startOfDayInTimeZone(
        new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
        timeZone,
      );
    case 'QUARTERLY': {
      const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
      return startOfDayInTimeZone(
        new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1)),
        timeZone,
      );
    }
    case 'YEARLY':
      return startOfDayInTimeZone(
        new Date(Date.UTC(date.getUTCFullYear(), 0, 1)),
        timeZone,
      );
    default:
      return null;
  }
}

function getCompletionWindowLabel(frequency: TaskItem['frequency']) {
  switch (frequency) {
    case 'DAILY':
      return 'day';
    case 'WEEKLY':
      return 'week';
    case 'MONTHLY':
      return 'month';
    case 'QUARTERLY':
      return 'quarter';
    case 'YEARLY':
      return 'year';
    default:
      return 'schedule window';
  }
}

function formatWindowDate(value: Date, timeZone: string) {
  return value.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });
}

function getStatusLockReason(task: TaskItem) {
  if (task.frequency === 'PLANNED') return null;

  const windowStart = getCompletionWindowStart(task);
  const dueAt = new Date(task.dueAt);
  if (!windowStart || Number.isNaN(dueAt.getTime())) return null;

  const now = new Date();
  if (now >= windowStart && now <= dueAt) return null;

  const timeZone = getTaskTimeZone(task);
  const windowLabel = getCompletionWindowLabel(task.frequency);
  if (now < windowStart) {
    return `Status can be changed in its scheduled ${windowLabel}, from ${formatWindowDate(windowStart, timeZone)}.`;
  }

  return `Status can no longer be changed after the due date, ${formatWindowDate(dueAt, timeZone)}.`;
}
export default function TaskMiniCard({ task, onClick, onStatusChange, onAcknowledgement, saving }: Props) {
  const isCompleted = task.status === 'DONE';
  const isOverdue = task.isOverdue || task.status === 'OVERDUE';
  const wasOverdue = !!task.wasOverdue && !isOverdue;
  const isPrerequisiteBlocked = !!task.prerequisiteBlocked;
  const statusLockReason = getStatusLockReason(task);
  const isStatusLockedBySchedule = !!statusLockReason;
  const prerequisiteLabel = task.prerequisiteActivityNames?.length
    ? `Locked until ${task.prerequisiteActivityNames.join(', ')} is done`
    : 'Locked until prerequisite activity is done';
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isAckOpen, setIsAckOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const ackMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
      if (ackMenuRef.current && !ackMenuRef.current.contains(event.target as Node)) {
        setIsAckOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Left border accent color depending on task status/category
  const getAccentBorderColorClass = () => {
    if (isCompleted) return 'border-l-emerald-500'; // Green
    if (isOverdue || !task.acknowledgedAt) return 'border-l-rose-500'; // Red
    return 'border-l-amber-500'; // Yellow
  };

  const accentBorderColorClass = getAccentBorderColorClass();



  const handleStatusSelect = (nextStatus: TaskStatus) => {
    setIsStatusOpen(false);
    onStatusChange(task.instanceId, nextStatus);
  };

  const getSelectableStatuses = (): TaskStatus[] => {
    if (
      isPrerequisiteBlocked ||
      isStatusLockedBySchedule ||
      task.status === 'DONE' ||
      task.status === 'APPROVAL_PENDING'
    ) {
      return [];
    }
    const statusOrder: Record<TaskStatus, number> = {
      PENDING: 0,
      OVERDUE: 1,
      IN_PROGRESS: 1,
      PARTLY_DONE: 2,
      DONE: 3,
      APPROVAL_PENDING: 4,
      LESS_THAN_50: 99,
      NOT_APPLICABLE: 99,
    };
    if (task.status === 'OVERDUE') {
      return ['DONE'];
    }
    const allOptions: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'PARTLY_DONE', 'DONE'];
    const currentOrder = statusOrder[task.status] ?? 0;
    return allOptions.filter(status => statusOrder[status] >= currentOrder);
  };

  const handleAckSelect = () => {
    setIsAckOpen(false);
    onAcknowledgement(task.taskId);
  };

  const formatStatus = (status: TaskStatus) => {
    return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Priority element matching mockup with extra light stroke, color-free SVG icons
  const renderPriority = () => {
    const p = task.priority === 'LOW' ? 'MEDIUM' : task.priority || 'MEDIUM';
    if (p === 'CRITICAL') {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-rose-500">
          <ArrowUp className="h-3.5 w-3.5 text-rose-500 shrink-0" strokeWidth={1.5} />
          <span>Critical</span>
        </span>
      );
    }
    if (p === 'HIGH') {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-zinc-400">
          <ArrowUp className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={1.5} />
          <span>High</span>
        </span>
      );
    }
    if (p === 'MEDIUM') {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-zinc-400">
          <Minus className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
          <span>Medium</span>
        </span>
      );
    }
    return null;
  };

  // Frequency element matching mockup with extra light stroke, color-free SVG icon
  const renderFrequency = () => {
    const label = task.frequency
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return (
      <div className="flex items-center gap-1.5 text-slate-500 font-normal text-[13px]">
        <Repeat className="h-3.5 w-3.5 text-slate-500 shrink-0" strokeWidth={1.5} />
        <span>{label}</span>
      </div>
    );
  };

  // Assigned By element matching mockup with extra light stroke, color-free borders/text on avatar bubble
  const renderAssignedBy = () => {
    if (!task.assignedBy || !task.assignedBy.name) return null;

    const assigner = task.assignedBy;
    const initials = assigner.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    // Stable hash based on assigner name to choose a light avatar background
    const charCodeSum = assigner.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const bgColors = [
      'bg-blue-50 text-blue-700 border-blue-200',
      'bg-slate-50 text-slate-700 border-slate-200',
    ];
    const borderBgClass = bgColors[charCodeSum % bgColors.length];

    return (
      <div className="flex items-center gap-1.5">
        <span className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold border ${borderBgClass}`}>
          {initials}
        </span>
        <span className="text-slate-700 font-normal text-[13px]">{assigner.name}</span>
      </div>
    );
  };

  // Due date element matching mockup with extra light stroke, color-free SVG icon
  const renderDueDate = () => {
    const dueDate = new Date(task.dueAt);

    if (isNaN(dueDate.getTime())) {
      return null;
    }

    let dateText = '';

    if (isTodayInOrganizationTimeZone(dueDate, getTaskTimeZone(task))) {
      dateText = 'Due by Today';
    } else {
      dateText = formatOrganizationDate(dueDate, getTaskTimeZone(task), {
        day: 'numeric',
        month: 'long',
      }) ?? '';
    }

    return (
      <div className="flex items-center gap-1.5 font-normal text-[13px]">
        <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" strokeWidth={1.5} />
        <span>{dateText}</span>
      </div>
    );
  };

  return (
    <article
      onClick={() => onClick(task)}
      className={`group flex flex-col rounded-2xl border-y border-r border-border-app border-l-[4px] ${accentBorderColorClass} bg-white p-5 shadow-sm transition-all duration-155 hover:border-y-accent-app/30 hover:border-r-accent-app/30 cursor-pointer ${isCompleted ? 'opacity-85' : ''
        }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col justify-center">
          {/* Title */}
          <h4 className={`text-[15px] font-normal leading-snug text-text-app line-clamp-2 group-hover:text-accent-app transition duration-150 ${isCompleted ? 'line-through opacity-50' : ''
            }`}>
            {task.title}
          </h4>

          {/* Acknowledged status */}
          {task.acknowledgedAt ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-app mt-1">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" strokeWidth={1.5} />
              <span className="text-emerald-600 font-normal text-xs">Acknowledged</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-rose-500/80 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
              <span className="font-normal text-xs">Not Acknowledged</span>
            </div>
          )}
          {isPrerequisiteBlocked && task.acknowledgedAt && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {prerequisiteLabel}
            </p>
          )}
          {!isPrerequisiteBlocked && isStatusLockedBySchedule && task.acknowledgedAt && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {statusLockReason}
            </p>
          )}
        </div>

        {/* Status Dropdown Pill */}
        <div className="relative shrink-0" ref={statusMenuRef}>
          {task.acknowledgedAt ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isPrerequisiteBlocked && !isStatusLockedBySchedule) {
                    setIsStatusOpen((current) => !current);
                  }
                }}
                disabled={saving || isPrerequisiteBlocked || isStatusLockedBySchedule || task.status === 'DONE' || task.status === 'APPROVAL_PENDING'}
                title={isPrerequisiteBlocked ? prerequisiteLabel : statusLockReason ?? undefined}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{formatStatus(task.status)}</span>
                {!isPrerequisiteBlocked && !isStatusLockedBySchedule && task.status !== 'DONE' && task.status !== 'APPROVAL_PENDING' && (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                )}
              </button>
              {isStatusOpen && !isPrerequisiteBlocked && !isStatusLockedBySchedule && (
                <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {getSelectableStatuses().map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStatusSelect(status);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-blue-50 ${task.status === status ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
                    >
                      {formatStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsAckOpen((current) => !current);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>Not Acknowledged</span>
                <ChevronDown className="h-3.5 w-3.5 text-rose-400 shrink-0" strokeWidth={1.5} />
              </button>
              {isAckOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleAckSelect();
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    Acknowledge
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Horizontal Divider */}
      <div className="border-t border-border-app my-4" onClick={() => setIsStatusOpen(false)} />

      {/* Bottom row */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4">
        {/* Left indicators */}
        <div className="flex flex-wrap items-center gap-5">
          {renderPriority()}
          {wasOverdue && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Was Overdue
            </span>
          )}
          {renderFrequency()}
          {renderAssignedBy()}
        </div>

        {/* Right indicator (Due Date) */}
        {renderDueDate()}
      </div>
    </article>
  );
}





