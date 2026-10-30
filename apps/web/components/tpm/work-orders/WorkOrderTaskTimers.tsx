"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Play, Square, Timer } from "lucide-react";
import {
  formatWorkOrderDuration,
  taskDurationSeconds,
  totalTaskDurationSeconds,
  type WorkOrder,
} from "./work-order-types";
import "./work-order-timers.css";

export function formatTaskTimestamp(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function WorkOrderTaskTimers({
  order,
  busy,
  onStart,
  onStop,
}: {
  order: WorkOrder;
  busy: boolean;
  onStart: (taskId: string) => void;
  onStop: (taskId: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const entries = order.taskTimeEntries ?? {};
  const running = Object.values(entries).filter(
    (entry) => !entry.stoppedAt,
  ).length;
  const complete = order.tasks.filter(
    (task) => order.taskResults[task.id],
  ).length;
  const readOnly = ["Draft", "Completed", "Cancelled"].includes(order.status);

  useEffect(() => {
    if (!running) return;
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [running]);

  return (
    <section className="wo-panel wod-panel">
      <div className="wod-section-heading">
        <div>
          <h2>
            <Timer size={18} /> Work tasks
          </h2>
          <p className="wo-muted">
            Start records the start time. Stop records the end time and
            completes the task.
          </p>
        </div>
        <span className="wo-badge">
          {complete}/{order.tasks.length} completed
        </span>
      </div>
      {order.tasks.length === 0 ? (
        <div className="wod-no-rows">
          No tasks added. Use Edit details to plan tasks, or complete this work
          order manually.
        </div>
      ) : (
        <>
          <div className="wot-summary">
            <div>
              <span>Total task time</span>
              <strong
                className="wot-duration"
                data-testid="total-task-duration"
              >
                {formatWorkOrderDuration(
                  totalTaskDurationSeconds(entries, now),
                )}
              </strong>
              <small>HH:MM:SS · Sum of task durations</small>
            </div>
            <div>
              <span>Running now</span>
              <strong>{running}</strong>
              <small>{order.tasks.length - complete} tasks remaining</small>
            </div>
            <p>
              When every task is complete, the work order completes
              automatically. Costs and scrap can be finalized afterwards.
            </p>
          </div>
          <ol className="wot-task-list">
            {order.tasks.map((task, index) => {
              const entry = entries[task.id];
              const done = Boolean(order.taskResults[task.id]);
              const active = !!entry && !entry.stoppedAt;
              return (
                <li
                  key={task.id}
                  className={`wot-task${active ? " is-running" : done ? " is-complete" : ""}`}
                  data-task-id={task.id}
                >
                  <div className="wot-task-heading">
                    <span className="wot-task-number">
                      {done ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <h3>{task.title || "Untitled task"}</h3>
                      <p>
                        {task.estimatedHours
                          ? `${task.estimatedHours} hours estimated`
                          : "No time estimate"}
                      </p>
                    </div>
                    <span
                      className={`wo-badge${active ? " wod-status-in-progress" : done ? " wod-status-completed" : ""}`}
                    >
                      {active ? "Running" : done ? "Completed" : "Not started"}
                    </span>
                  </div>
                  {task.description && (
                    <p className="wot-instructions">{task.description}</p>
                  )}
                  <div className="wot-execution">
                    <div className="wot-clock">
                      <Clock3 size={17} />
                      <div>
                        <span>Time spent · HH:MM:SS</span>
                        <strong
                          className="wot-duration"
                          data-testid={`task-duration-${task.id}`}
                        >
                          {formatWorkOrderDuration(
                            taskDurationSeconds(entry, now),
                          )}
                        </strong>
                      </div>
                    </div>
                    <dl className="wot-timestamps">
                      <div>
                        <dt>Started</dt>
                        <dd>
                          {entry ? (
                            <time dateTime={entry.startedAt}>
                              {formatTaskTimestamp(entry.startedAt)}
                            </time>
                          ) : (
                            "Not started"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Stopped</dt>
                        <dd>
                          {entry?.stoppedAt ? (
                            <time dateTime={entry.stoppedAt}>
                              {formatTaskTimestamp(entry.stoppedAt)}
                            </time>
                          ) : active ? (
                            "Timer running"
                          ) : (
                            "Not recorded"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Performed by</dt>
                        <dd>{entry?.performedByName || "Not recorded"}</dd>
                      </div>
                    </dl>
                    <div className="wot-controls">
                      <button
                        type="button"
                        className="tpm-button primary"
                        aria-label={`Start task: ${task.title}`}
                        disabled={busy || readOnly || done || !!entry}
                        onClick={() => onStart(task.id)}
                      >
                        <Play size={14} /> Start
                      </button>
                      <button
                        type="button"
                        className="tpm-button wot-stop"
                        aria-label={`Stop task: ${task.title}`}
                        disabled={busy || readOnly || !active}
                        onClick={() => onStop(task.id)}
                      >
                        <Square size={14} /> Stop
                      </button>
                    </div>
                  </div>
                  {done && !entry && (
                    <p className="wot-legacy">
                      Completed before time tracking was recorded.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
