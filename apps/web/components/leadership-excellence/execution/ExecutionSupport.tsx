"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import type {
  ExecutionSupportRequest,
  ExecutionView,
} from "@/services/leadership-excellence/execution.service";
import { useExecution } from "./ExecutionProvider";
import { useExecutionScope } from "./ExecutionFrame";
import {
  ExecutionStatus,
  HistoryList,
  Metric,
  ReloadExecutionEntries,
} from "./ExecutionUi";
import {
  groupSupportRequests,
  isSupportActor,
  supportAcceptanceElapsed,
  supportAcknowledgementState,
  supportPerson,
  supportRequestsInScope,
  supportSummary,
} from "@/services/leadership-excellence/execution/support";
import {
  Button,
  card,
  control,
  Empty,
  ErrorList,
  Field,
  Modal,
} from "../performance-planning/PlanningUi";

const PATH = "/leadership-excellence/execution/support-requests";
export function ExecutionSupport() {
  const { data } = useExecution();
  const selection = useExecutionScope();
  const { goals, scope, cycle } = selection;
  const params = useSearchParams();
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState("OPEN");
  const [direction, setDirection] = useState("ALL");
  const selected = data.supportRequests.find(
    (r) => r.id === params.get("request"),
  );
  const goalParam = params.get("goal");
  const creatable = goals.filter((g) => g.canRequestSupport);
  const requests = supportRequestsInScope(data, selection);
  const totals = supportSummary(requests, data.actor, data.references.people);
  const groups = groupSupportRequests(requests, data.references.people);
  const visible = requests.filter(
    (r) =>
      (direction === "ALL" ||
        isSupportActor(
          direction === "SENT" ? r.requestorId : r.assignedToId,
          data.actor,
          data.references.people,
        )) &&
      (filter === "ALL" ||
        (filter === "OPEN"
          ? !["CLOSED", "RESOLVED"].includes(r.status)
          : ["CLOSED", "RESOLVED"].includes(r.status))),
  );
  const base = `${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}`;
  const close = () => {
    setShowNew(false);
    router.push(base);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Support requests</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ask for a resource, decision or help. Keep the request linked to the
            work.
          </p>
        </div>
        {creatable.length > 0 && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} />
            Ask for support
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Sent" value={totals.sent} hint="By me" />
        <Metric label="Received" value={totals.received} hint="Assigned to me" />
        <Metric label="Awaiting acknowledgement" value={totals.pending} />
        <Metric label="Accepted" value={totals.accepted} />
      </div>
      <p className="text-xs text-slate-500">
        Totals cover the current planning period and scope, across all request
        statuses. Acceptance confirms receipt; the request status tracks delivery.
        {totals.notRecorded > 0 &&
          ` Acceptance was not recorded for ${totals.notRecorded} resolved or closed request${totals.notRecorded === 1 ? "" : "s"}.`}
      </p>
      {groups.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Requests by sender and recipient ({requests.length} sent)
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {groups.map((group) => (
              <li
                key={group.key}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 text-sm"
              >
                <p className="min-w-0 break-words">
                  <span className="font-medium">
                    {supportName(group.requestorId, data)}
                  </span>{" "}
                  <span className="text-slate-500">to</span>{" "}
                  {supportName(group.assignedToId, data)}
                </p>
                <p className="text-xs text-slate-600">
                  {group.sent} sent · {group.accepted} accepted · {group.pending}{" "}
                  awaiting acknowledgement
                  {group.notRecorded > 0 &&
                    ` · ${group.notRecorded} not recorded`}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-4">
        <label className="block w-full text-sm font-medium sm:w-56">
          Requests
          <select
            className={control}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="ALL">All visible</option>
            <option value="SENT">Sent by me</option>
            <option value="RECEIVED">Received by me</option>
          </select>
        </label>
        <label className="block w-full text-sm font-medium sm:w-56">
          Status
          <select
            className={control}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="OPEN">Open requests</option>
            <option value="CLOSED">Resolved / closed</option>
            <option value="ALL">All requests</option>
          </select>
        </label>
      </div>
      {visible.length ? (
        visible.map((request) => (
          <SupportCard
            key={request.id}
            request={request}
            onOpen={() =>
              router.push(`${base}&request=${encodeURIComponent(request.id)}`)
            }
          />
        ))
      ) : (
        <Empty title="No support requests in this view">
          {requests.length
            ? "Try another request or status filter to see requests in this planning period."
            : "Requests sent or received for this planning period appear here. You can ask for help with an approved goal or action."}
        </Empty>
      )}
      {(showNew || goalParam) && (
        <SupportCreate
          key={goalParam || "new"}
          initialGoal={goalParam || ""}
          initialAction={params.get("action") || ""}
          onClose={close}
        />
      )}
      {selected && (
        <SupportDetail key={selected.id} request={selected} onClose={close} />
      )}
    </div>
  );
}

function supportName(id: string, data: ExecutionView) {
  const person = supportPerson(id, data.references.people);
  if (person) return person.name;
  if (isSupportActor(id, data.actor, data.references.people))
    return data.actor.name;
  // Administrators without an employee record still have a sender name in the
  // request history. Do not lose that attribution when references change.
  const original = data.supportRequests.find(
    (request) => request.requestorId === id,
  );
  return (
    original?.history.find((entry) => entry.event === "Support requested")?.name ||
    "Person unavailable"
  );
}

function SupportTime({ value }: { value: string }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? (
    <time dateTime={value}>{date.toLocaleString()}</time>
  ) : (
    <>Date not recorded</>
  );
}

function SupportAcknowledgement({
  request,
}: {
  request: ExecutionSupportRequest;
}) {
  const { data } = useExecution();
  const state = supportAcknowledgementState(request);
  const elapsed = supportAcceptanceElapsed(request);
  if (state === "ACCEPTED" && request.acknowledgement) {
    return (
      <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
        <p className="font-medium">
          Accepted by{" "}
          {request.acknowledgement.name ||
            supportName(request.acknowledgement.by, data)}
        </p>
        <p className="mt-1">
          <SupportTime value={request.acknowledgement.at} />
          {elapsed !== null
            ? ` · Accepted after ${elapsed}`
            : " · Acceptance time unavailable"}
        </p>
      </div>
    );
  }
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs ${state === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}
    >
      {state === "PENDING"
        ? "Awaiting acknowledgement"
        : "Acceptance: Not recorded"}
    </p>
  );
}

function SupportParties({ request }: { request: ExecutionSupportRequest }) {
  const { data } = useExecution();
  return (
    <div className="space-y-1 text-xs text-slate-500">
      <p>
        Sent by <strong>{supportName(request.requestorId, data)}</strong> to{" "}
        <strong>{supportName(request.assignedToId, data)}</strong>
      </p>
      <p>
        Sent <SupportTime value={request.createdAt} /> · Needed by{" "}
        {request.dueDate}
        {request.dueDate < data.today &&
        !["CLOSED", "RESOLVED"].includes(request.status)
          ? " · Overdue"
          : ""}
      </p>
    </div>
  );
}

function SupportCard({
  request,
  onOpen,
}: {
  request: ExecutionSupportRequest;
  onOpen: () => void;
}) {
  const { data, run, busy } = useExecution();
  const [error, setError] = useState("");
  async function accept() {
    setError("");
    try {
      await run("ACKNOWLEDGE_SUPPORT", { id: request.id });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not accept the request.",
      );
    }
  }
  return (
    <article className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <button
            onClick={onOpen}
            className="break-words text-left text-lg font-semibold hover:text-indigo-700 hover:underline"
          >
            {request.title} <ArrowRight size={16} className="inline" />
          </button>
          <p className="text-sm text-slate-500">
            {request.goalTitle ||
              data.goals.find((g) => g.key === request.goalKey)?.item.title ||
              "Linked approved work"}
          </p>
          <SupportParties request={request} />
        </div>
        <ExecutionStatus status={request.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div aria-live="polite">
          <SupportAcknowledgement request={request} />
        </div>
        {request.canAcknowledge && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void accept()}
          >
            Accept request
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3 space-y-2">
          <ErrorList error={error} />
          <ReloadExecutionEntries onReload={() => setError("")} />
        </div>
      )}
    </article>
  );
}

function SupportCreate({
  initialGoal,
  initialAction,
  onClose,
}: {
  initialGoal: string;
  initialAction: string;
  onClose: () => void;
}) {
  const { data, run, busy } = useExecution();
  const { goals, actions } = useExecutionScope();
  const available = goals.filter((g) => g.canRequestSupport);
  const [goalKey, setGoal] = useState(
    available.some((g) => g.key === initialGoal)
      ? initialGoal
      : available[0]?.key || "",
  );
  const [actionKey, setAction] = useState(initialAction);
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [assignedToId, setAssignee] = useState("");
  const [dueDate, setDue] = useState("");
  const [revision, setRevision] = useState(data.revision);
  const [error, setError] = useState("");
  async function save() {
    setError("");
    try {
      await run(
        "CREATE_SUPPORT",
        {
          goalKey,
          actionKey: actionKey || undefined,
          title,
          request,
          assignedToId,
          dueDate,
        },
        revision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the request. Your entries are still here.",
      );
    }
  }
  return (
    <Modal
      title="Ask for support"
      onClose={onClose}
      description="Send a specific request to the person who can help."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !goalKey} onClick={() => void save()}>
            Send request
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorList error={error} />
        {error && <ReloadExecutionEntries onReload={setRevision} />}
        <Field label="Related goal">
          <select
            className={control}
            value={goalKey}
            onChange={(e) => {
              setGoal(e.target.value);
              setAction("");
            }}
          >
            <option value="">Choose approved work…</option>
            {available.map((g) => (
              <option key={g.key} value={g.key}>
                {g.item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Related action (optional)">
          <select
            className={control}
            value={actionKey}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Goal-level support</option>
            {actions
              .filter((a) => a.goalKey === goalKey)
              .map((a) => (
                <option key={a.key} value={a.key}>
                  {a.action.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Request title">
          <input
            className={control}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What help is needed?"
          />
        </Field>
        <Field label="Explain the support needed">
          <textarea
            className={control}
            rows={3}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Describe the blocker, help required and effect on the work."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who can help?">
            <select
              className={control}
              value={assignedToId}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Select a person…</option>
              {data.references.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.position ? ` · ${person.position}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Needed by">
            <input
              type="date"
              className={control}
              value={dueDate}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function SupportDetail({
  request,
  onClose,
}: {
  request: ExecutionSupportRequest;
  onClose: () => void;
}) {
  const { data, run, busy } = useExecution();
  const [response, setResponse] = useState(request.response || "");
  const [status, setStatus] = useState(
    request.status === "OPEN" ? "IN_PROGRESS" : request.status,
  );
  const [revision, setRevision] = useState(data.revision);
  const [error, setError] = useState("");
  const canRespond = !!request.canRespond && request.status !== "CLOSED";
  async function accept() {
    setError("");
    try {
      const latest = await run(
        "ACKNOWLEDGE_SUPPORT",
        { id: request.id },
        revision,
      );
      // Keep the draft and modal open, but base the next save on the accepted
      // workspace revision so acceptance does not make this form stale.
      setRevision(latest.revision);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not accept the request. Your entries are still here.",
      );
    }
  }
  async function save(close = false) {
    setError("");
    try {
      await run(
        "UPDATE_SUPPORT",
        { id: request.id, status: close ? "CLOSED" : status, response },
        revision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the response. Your entries are still here.",
      );
    }
  }
  return (
    <Modal
      title={request.title}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          {request.canClose && request.status === "RESOLVED" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Close request
            </Button>
          )}
          {canRespond && (
            <Button disabled={busy} onClick={() => void save()}>
              Save response
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <ErrorList error={error} />
        {error && <ReloadExecutionEntries onReload={setRevision} />}
        <ExecutionStatus status={request.status} />
        <p className="text-sm text-slate-500">
          {request.goalTitle ||
            data.goals.find((goal) => goal.key === request.goalKey)?.item.title ||
            "Linked approved work"}
        </p>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="whitespace-pre-wrap text-sm">{request.request}</p>
          <div className="mt-3">
            <SupportParties request={request} />
          </div>
        </div>
        <div className="space-y-3">
          <div aria-live="polite">
            <SupportAcknowledgement request={request} />
          </div>
          {request.canAcknowledge && (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy} onClick={() => void accept()}>
                Accept request
              </Button>
              <p className="text-xs text-slate-500">
                Confirm receipt. You can update the response and delivery status
                below.
              </p>
            </div>
          )}
        </div>
        {canRespond ? (
          <>
            <Field label="Response status">
              <select
                className={control}
                value={status}
                disabled={busy}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="IN_PROGRESS">Working on the request</option>
                <option value="RESOLVED">Support provided / resolved</option>
              </select>
            </Field>
            <Field label="Response">
              <textarea
                className={control}
                rows={3}
                value={response}
                disabled={busy}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="What support will you provide, and when?"
              />
            </Field>
          </>
        ) : (
          <p className="text-sm">
            <strong>Response:</strong> {request.response || "No response yet."}
          </p>
        )}
        <details className="border-t border-slate-200 pt-4">
          <summary className="cursor-pointer text-sm text-slate-600">
            Activity history ({request.history.length})
          </summary>
          <div className="mt-4">
            <HistoryList history={request.history} />
          </div>
        </details>
      </div>
    </Modal>
  );
}
