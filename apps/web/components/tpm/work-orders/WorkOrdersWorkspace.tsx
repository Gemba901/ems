"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Factory,
  Plus,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import { useWorkOrders } from "./WorkOrdersProvider";
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  isWorkOrderOverdue,
} from "./work-order-types";
import "./work-order-list-form.css";

export function WorkOrdersWorkspace() {
  const { orders, loading, error, retry } = useWorkOrders();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("newest");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const visible = useMemo(
    () =>
      orders
        .filter((order) => {
          const text =
            `${order.code} ${order.title || "Untitled work order"} ${order.assetName} ${order.assetCode} ${order.assigneeName} ${order.departmentName} ${order.team}`.toLowerCase();
          return (
            text.includes(search.trim().toLowerCase()) &&
            (!status || order.status === status) &&
            (!priority || order.priority === priority) &&
            (!overdueOnly || isWorkOrderOverdue(order))
          );
        })
        .sort((a, b) =>
          sort === "due"
            ? (a.dueAt
                ? new Date(a.dueAt).getTime()
                : Number.MAX_SAFE_INTEGER) -
              (b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER)
            : sort === "priority"
              ? WORK_ORDER_PRIORITIES.indexOf(b.priority) -
                  WORK_ORDER_PRIORITIES.indexOf(a.priority) ||
                b.createdAt.localeCompare(a.createdAt)
              : b.createdAt.localeCompare(a.createdAt),
        ),
    [orders, search, status, priority, sort, overdueOnly],
  );
  const metrics = [
    {
      label: "Total work orders",
      count: orders.length,
      hint: `${orders.filter((item) => item.status === "Draft").length} drafts included`,
      icon: ClipboardList,
      tone: "indigo",
    },
    {
      label: "Open",
      count: orders.filter((item) => item.status === "Open").length,
      hint: "Ready to be planned",
      icon: Clock3,
      tone: "blue",
    },
    {
      label: "In progress",
      count: orders.filter((item) => item.status === "In progress").length,
      hint: "Work happening now",
      icon: Wrench,
      tone: "green",
    },
    {
      label: "Overdue",
      count: orders.filter((item) => isWorkOrderOverdue(item)).length,
      hint: "Past the due date",
      icon: AlertCircle,
      tone: "amber",
    },
  ];

  return (
    <div className="wo-list-page">
      <header className="wo-page-heading">
        <div>
          <h1>
            Work orders <span>{orders.length}</span>
          </h1>
          <p>
            Plan maintenance, track progress, and keep every cost in one place.
          </p>
        </div>
        <Link
          href="/tpm/work-orders/new"
          className="tpm-button tpm-button-primary"
        >
          <Plus size={18} />
          New work order
        </Link>
      </header>
      {loading ? (
        <div className="wo-empty" role="status">
          <Clock3 size={28} />
          <h2>Loading work orders…</h2>
        </div>
      ) : error ? (
        <div className="wo-empty" role="alert">
          <AlertCircle size={28} />
          <h2>Could not load work orders</h2>
          <p>{error}</p>
          <button type="button" className="tpm-button" onClick={retry}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="wo-kpi-grid" aria-label="Work order summary">
            {metrics.map(({ label, count, hint, icon: Icon, tone }) => (
              <div className="wo-kpi" key={label}>
                <span className={`wo-kpi-icon wo-tone-${tone}`}>
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{count}</strong>
                  <span>{label}</span>
                  <small>{hint}</small>
                </div>
              </div>
            ))}
          </section>
          <section className="wo-filters" aria-label="Filter work orders">
            <div className="wo-search">
              <Search size={19} />
              <input
                aria-label="Search work orders"
                placeholder="Search work order, asset or assignee…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {WORK_ORDER_STATUSES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="">All priorities</option>
                {WORK_ORDER_PRIORITIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="wo-overdue-toggle">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              Overdue only
            </label>
            {(search || status || priority || overdueOnly) && (
              <button
                className="wo-text-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  setPriority("");
                  setOverdueOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
          </section>
          <div className="wo-list-toolbar">
            <h2>
              Work orders{" "}
              <span>
                ({visible.length} of {orders.length})
              </span>
            </h2>
            <label>
              <ArrowDownWideNarrow size={17} />
              <select
                aria-label="Sort work orders"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="due">Due date</option>
                <option value="priority">Highest priority</option>
              </select>
            </label>
          </div>
          {!visible.length ? (
            <div className="wo-empty">
              <span className="wo-empty-icon">
                <Wrench size={28} />
              </span>
              <h2>
                {orders.length
                  ? "No matching work orders"
                  : "A clearer plan for every repair"}
              </h2>
              <p>
                {orders.length
                  ? "Try another search or clear your filters."
                  : "Create your first work order to assign work, record costs, and track the repair from start to finish."}
              </p>
              {!orders.length && (
                <Link
                  href="/tpm/work-orders/new"
                  className="tpm-button tpm-button-primary"
                >
                  <Plus size={17} />
                  Create work order
                </Link>
              )}
            </div>
          ) : (
            <div className="wo-order-list">
              {visible.map((order) => (
                <Link
                  className="wo-order-row"
                  href={`/tpm/work-orders/${order.id}`}
                  key={order.id}
                >
                  <span className="wo-row-icon">
                    <Wrench size={21} />
                  </span>
                  <div className="wo-row-main">
                    <div>
                      <span className="wo-code">{order.code}</span>
                      <span
                        className={`wo-status wo-status-${order.status.toLowerCase().replaceAll(" ", "-")}`}
                      >
                        {order.status}
                      </span>
                      {order.status === "Completed" && (
                        <span className="wo-status wo-status-draft">
                          Financial {order.financialStatus.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <h3>{order.title || "Untitled work order"}</h3>
                    <p>
                      <Factory size={14} />
                      {order.assetName || "Asset not selected"}
                      {order.assetCode && (
                        <>
                          <span>·</span>
                          {order.assetCode}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="wo-row-priority">
                    <small>Priority</small>
                    <span
                      className={`wo-priority wo-priority-${order.priority.toLowerCase()}`}
                    >
                      <i />
                      {order.priority}
                    </span>
                  </div>
                  <div className="wo-row-assignee">
                    <small>Assigned to</small>
                    <span>
                      <UserRound size={14} />
                      {order.assigneeName || "Unassigned"}
                    </span>
                  </div>
                  <div
                    className={`wo-row-due ${isWorkOrderOverdue(order) ? "is-overdue" : ""}`}
                  >
                    <small>
                      {isWorkOrderOverdue(order) ? "Overdue" : "Due date"}
                    </small>
                    <span>
                      <CalendarDays size={14} />
                      {order.dueAt ? (
                        <time dateTime={order.dueAt}>
                          {new Date(order.dueAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      ) : (
                        <span>Not scheduled</span>
                      )}
                    </span>
                  </div>
                  <ChevronRight className="wo-row-chevron" size={18} />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
