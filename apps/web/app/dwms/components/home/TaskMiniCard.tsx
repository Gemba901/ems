import { useEffect, useRef, useState } from 'react';
import type { DwmsTaskItem as TaskItem, DwmsTaskStatus as TaskStatus } from '@/services/dwms.service';
import { ArrowUp, Minus, Repeat, Clock, CheckCircle, ChevronDown } from 'lucide-react';

type Props = {
  task: TaskItem;
  onClick: (task: TaskItem) => void;
  onStatusChange: (instanceId: string, nextStatus: TaskStatus) => void;
  onAcknowledgement: (taskId: string) => void;
  saving: boolean;
};

export default function TaskMiniCard({ task, onClick, onStatusChange, onAcknowledgement, saving }: Props) {
  const isCompleted = task.status === 'DONE';
  const isOverdue = task.isOverdue || task.status === 'OVERDUE';
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
    if (task.status === 'DONE' || task.status === 'APPROVAL_PENDING') {
      return [];
    }
    const statusOrder: Record<TaskStatus, number> = {
      PENDING: 0,
      OVERDUE: 0,
      IN_PROGRESS: 1,
      PARTLY_DONE: 2,
      DONE: 3,
      APPROVAL_PENDING: 4,
      LESS_THAN_50: 99,
      NOT_APPLICABLE: 99,
    };
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
    const label = task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1).toLowerCase();
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
    let dueDate: Date | null = null;

    if (task.frequency === 'DAILY') {
      dueDate = new Date();
    } else if (task.frequency === 'WEEKLY') {
      const baseDate = new Date(task.dueAt);
      const day = baseDate.getDay();
      const diff = 6 - day;
      baseDate.setDate(baseDate.getDate() + diff);
      dueDate = baseDate;
    } else if (task.frequency === 'MONTHLY') {
      const baseDate = new Date(task.dueAt);
      dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    } else if (task.assignedBy && task.assignedBy.name) {
      dueDate = new Date(task.dueAt);
    } else {
      return null;
    }

    if (!dueDate || isNaN(dueDate.getTime())) {
      return null;
    }

    const todayStr = new Date().toDateString();
    let dateText = '';

    if (dueDate.toDateString() === todayStr) {
      dateText = 'Due by Today';
    } else {
      const day = dueDate.getDate();
      const month = dueDate.toLocaleDateString('en-US', { month: 'long' });
      dateText = `${day} ${month}`;
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
        </div>

        {/* Status Dropdown Pill */}
        <div className="relative shrink-0" ref={statusMenuRef}>
          {task.acknowledgedAt ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsStatusOpen((current) => !current);
                }}
                disabled={saving || task.status === 'DONE' || task.status === 'APPROVAL_PENDING'}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{formatStatus(task.status)}</span>
                {task.status !== 'DONE' && task.status !== 'APPROVAL_PENDING' && (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                )}
              </button>
              {isStatusOpen && (
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
          {renderFrequency()}
          {renderAssignedBy()}
        </div>

        {/* Right indicator (Due Date) */}
        {renderDueDate()}
      </div>
    </article>
  );
}
