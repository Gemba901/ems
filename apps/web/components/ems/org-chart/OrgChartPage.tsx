"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChartTree, type TreeItem } from "./ChartTree";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { TenantImage } from "@/components/files/TenantImage";
import { readOrgChart } from "@/services/ems-org-chart.service";
import {
  active,
  bodyLabels,
  buildView,
  issueLabels,
  type ChartData,
  type Person,
} from "./model";
const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50";
const field =
  "min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
const empty: ChartData = {
  people: [],
  issues: [],
  source: "EMS registered employees",
  refreshedAt: "",
};
function Portrait({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.photoUrl]);
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-xs font-semibold text-violet-800">
      <span>
        {person.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => Array.from(s)[0])
          .join("")}
      </span>
      {person.photoUrl && !failed && (
        <TenantImage
          src={person.photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
export function OrgChartPage() {
  const { accessToken, user } = useAuthStore();
  return (
    <Chart
      key={user?.organizationId ?? "none"}
      token={accessToken}
      organizationId={user?.organizationId}
    />
  );
}
function Chart({
  token,
  organizationId,
}: {
  token: string | null;
  organizationId?: string | null;
}) {
  const query = useQuery({
    queryKey: ["ems-org-chart", organizationId],
    queryFn: ({ signal }) => readOrgChart(token!, signal),
    enabled: !!token && !!organizationId,
    staleTime: 30_000,
  });
  const data = query.data ?? empty;
  const [department, setDepartment] = useState(""),
    [branch, setBranch] = useState("");
  const [inactive, setInactive] = useState(false),
    [issuesOnly, setIssuesOnly] = useState(false);
  const [focus, setFocus] = useState(""),
    [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState(""),
    [outline, setOutline] = useState(false);
  const [group, setGroup] = useState<"connected" | "unconnected">("connected");
  const [fitRequest, setFitRequest] = useState(0);
  const [showAll, setShowAll] = useState(false),
    [hydrated, setHydrated] = useState(false);
  const restored = useRef(false),
    stateKey = `ems-chart-return:${organizationId}`;
  const savePosition = (id: string) => {
    setSelected(id);
    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({ selected: id, y: window.scrollY }),
      );
    } catch {}
  };
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setDepartment(p.get("department") ?? "");
    setBranch(p.get("branch") ?? "");
    setFocus(p.get("focus") ?? "");
    setInactive(p.get("inactive") === "1");
    setIssuesOnly(p.get("issues") === "1");
    setExpanded(new Set((p.get("open") ?? "").split(",").filter(Boolean)));
    setCollapsed(new Set((p.get("closed") ?? "").split(",").filter(Boolean)));
    setGroup(p.get("group") === "unconnected" ? "unconnected" : "connected");
    setOutline(p.get("outline") === "1");
    setShowAll(p.get("all") === "1");
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!query.data || !hydrated || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(stateKey) ?? "null");
      if (saved) {
        setSelected(saved.selected ?? "");
        requestAnimationFrame(() => window.scrollTo(0, Number(saved.y) || 0));
      }
    } catch {}
  }, [query.data, hydrated, stateKey]);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected("");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (department) p.set("department", department);
    if (branch) p.set("branch", branch);
    if (focus) p.set("focus", focus);
    if (inactive) p.set("inactive", "1");
    if (issuesOnly) p.set("issues", "1");
    if (outline) p.set("outline", "1");
    if (showAll) p.set("all", "1");
    if (group === "unconnected") p.set("group", group);
    if (expanded.size) p.set("open", [...expanded].join(","));
    if (collapsed.size) p.set("closed", [...collapsed].join(","));
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${p.size ? "?" + p : ""}`,
    );
  }, [
    hydrated,
    department,
    branch,
    focus,
    inactive,
    issuesOnly,
    outline,
    group,
    expanded,
    collapsed,
    showAll,
  ]);
  const view = useMemo(
    () => buildView(data, { department, branch, inactive, issuesOnly, focus }),
    [data, department, branch, inactive, issuesOnly, focus],
  );
  const departments = [
    ...new Map(
      data.people
        .filter((p) => p.department)
        .map((p) => [p.department!.id, p.department!]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const branches = [
    ...new Map(
      data.people
        .filter((p) => p.branch || p.branchText)
        .map((p) => [
          p.branch?.id ?? p.branchText!,
          p.branch?.name ?? p.branchText!,
        ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const results = search.trim()
    ? data.people
        .filter((p) =>
          `${p.name} ${p.jobTitle ?? ""} ${p.department?.name ?? ""}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
        )
        .slice(0, 20)
    : [];
  const issues = data.issues.filter((i) => view.matches.has(i.employeeId));
  const issueMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of data.issues)
      map.set(issue.employeeId, [
        ...(map.get(issue.employeeId) ?? []),
        issueLabels[issue.kind] ?? issue.kind,
      ]);
    return map;
  }, [data.issues]);
  const connectedCount = [...view.matches].filter((id) =>
    view.connected.has(id),
  ).length;
  const unconnectedCount = view.matches.size - connectedCount;
  const roots =
    group === "connected" ? view.connectedRoots : view.unconnectedRoots;
  const bodies = new Map<string, string>();
  for (const root of roots)
    if (
      group === "connected" &&
      !view.parents.get(root.id) &&
      bodyLabels[root.reportsToBody ?? ""]
    )
      bodies.set(`body:${root.reportsToBody}`, bodyLabels[root.reportsToBody!]);
  const open = (id: string) =>
    !collapsed.has(id) &&
    (showAll ||
      expanded.has(id) ||
      (view.depths.get(id) ?? 0) < 2 ||
      !view.matches.has(id) ||
      id === focus);
  const toggle = (id: string) => {
    if (open(id)) {
      setCollapsed((s) => new Set(s).add(id));
      setExpanded((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    } else {
      setExpanded((s) => new Set(s).add(id));
      setCollapsed((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };
  const items: TreeItem[] = [...bodies].map(([id]) => ({ id, parentId: null }));
  // No arbitrary card cap: Overview folds branches; Show all includes every person in this group.
  const pending = roots
    .slice()
    .reverse()
    .map((person) => ({
      person,
      parentId: bodies.has(`body:${person.reportsToBody}`)
        ? `body:${person.reportsToBody}`
        : (null as string | null),
    }));
  const seen = new Set<string>();
  while (pending.length) {
    const { person, parentId } = pending.pop()!;
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    items.push({ id: person.id, parentId });
    if (open(person.id)) {
      const kids = (view.children.get(person.id) ?? []).filter((id) =>
        view.included.has(id),
      );
      for (let i = kids.length - 1; i >= 0; i--)
        pending.push({ person: view.byId.get(kids[i])!, parentId: person.id });
    }
  }
  const overview = () => {
    setFitRequest((n) => n + 1);
    setExpanded(new Set());
    setCollapsed(new Set());
    setShowAll(false);
    setSelected("");
  };
  const reset = () => {
    setDepartment("");
    setBranch("");
    setFocus("");
    setIssuesOnly(false);
    setInactive(false);
    setSearch("");
    setGroup("connected");
    overview();
  };
  const focusPerson = (id: string) => {
    const person = view.byId.get(id);
    if (!person) return;
    setFocus(id);
    setDepartment("");
    setBranch("");
    setIssuesOnly(false);
    setSearch("");
    setSelected(id);
    setGroup(view.connected.has(id) ? "connected" : "unconnected");
    setExpanded(new Set([id]));
    setCollapsed(new Set());
    setShowAll(false);
    if (!active(person)) setInactive(true);
  };
  const changeGroup = (next: "connected" | "unconnected") => {
    setGroup(next);
    setFocus("");
    overview();
  };
  const detail = view.byId.get(selected);
  const chartKey = `${group}:${department}:${branch}:${focus}:${inactive}:${issuesOnly}:${outline}`;
  return (
    <div className="min-w-0 space-y-4 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-700">
            EMS · Organisation
          </p>
          <h1 className="mt-1 text-2xl font-bold">Org chart</h1>
          <p className="mt-1 text-sm text-slate-600">
            People and reporting relationships across your company.
          </p>
        </div>
        <button
          type="button"
          className={button}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Unable to load chart."}{" "}
          {query.data ? "Showing the last loaded chart." : ""}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      <section
        aria-label="Chart filters"
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Find a person
            <input
              className={field}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, job title or department"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Department
            <select
              className={field}
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setFocus("");
                setSelected("");
              }}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Branch
            <select
              className={field}
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setFocus("");
                setSelected("");
              }}
            >
              <option value="">All branches</option>
              {branches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {search.trim() && (
          <div
            aria-label="Search results"
            className="max-h-52 overflow-auto rounded-lg border border-slate-200"
          >
            {results.length ? (
              results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="block w-full border-b p-2 text-left text-sm hover:bg-violet-50"
                  onClick={() => focusPerson(p.id)}
                >
                  <strong>{p.name}</strong> ·{" "}
                  {p.jobTitle || "Job title not set"} ·{" "}
                  {p.department?.name || "No department"} ·{" "}
                  {p.branch?.name || p.branchText || "No branch"}
                </button>
              ))
            ) : (
              <p className="p-3 text-sm">No matching people.</p>
            )}
            <p className="p-2 text-xs text-slate-500">
              Up to 20 results. Select a person to focus their reporting branch.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={inactive}
              onChange={(e) => setInactive(e.target.checked)}
            />
            Include inactive employees
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={issuesOnly}
              onChange={(e) => setIssuesOnly(e.target.checked)}
            />
            Reporting issues only
          </label>
          <button
            type="button"
            className="text-violet-700 underline"
            onClick={reset}
          >
            Reset view
          </button>
        </div>
      </section>
      {query.isPending || !hydrated ? (
        <p role="status" className="rounded-xl bg-white p-8">
          Loading organisation chart…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Reporting groups"
              className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
            >
              {(
                [
                  ["connected", `Connected hierarchy (${connectedCount})`],
                  ["unconnected", `Unconnected (${unconnectedCount})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={group === value}
                  onClick={() => changeGroup(value)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${group === value ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={overview}>
                Overview
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setShowAll(true);
                  setExpanded(new Set());
                  setCollapsed(new Set());
                }}
              >
                Show all
              </button>
              <button
                type="button"
                className={button}
                aria-pressed={outline}
                onClick={() => setOutline(!outline)}
              >
                {outline ? "Show chart" : "Show outline"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
            <p>
              {seen.size} people visible ·{" "}
              {group === "connected" ? connectedCount : unconnectedCount}{" "}
              matching people in this group
              {seen.size >
              (group === "connected" ? connectedCount : unconnectedCount)
                ? " · includes managers outside the filter"
                : ""}
            </p>
            <p>
              {view.average.toFixed(1)} average direct reports · {view.layers}{" "}
              layers · {issues.length} reporting issues
            </p>
          </div>
          {focus && (
            <p className="rounded-lg bg-violet-50 p-2 text-sm text-violet-900">
              Focused on{" "}
              <strong>
                {view.byId.get(focus)?.name ?? "an unavailable person"}
              </strong>{" "}
              · team below and chain above.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setFocus("");
                  setSelected("");
                }}
              >
                Clear focus
              </button>
            </p>
          )}
          {view.contextTruncated && (
            <p className="text-xs text-slate-600">
              Up to eight managers above the focused team are shown. Clear focus
              to see the full chain.
            </p>
          )}
          {group === "unconnected" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              These people have no complete saved path to Board, Committee,
              Management Committee or Owner. Their valid team links remain
              visible here. Select a person to review the reporting details.
            </p>
          )}
          {!items.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <h2 className="font-semibold">
                {!data.people.length
                  ? "No registered employees yet"
                  : !view.matches.size
                    ? "No people match this view"
                    : group === "connected"
                      ? "No connected hierarchy in this view"
                      : "No unconnected people in this view"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {!data.people.length
                  ? "Registered employees will appear with their saved reporting relationships."
                  : "Adjust the filters or switch reporting groups."}
              </p>
              {group === "connected" && unconnectedCount > 0 && (
                <button
                  type="button"
                  className="mt-3 font-semibold text-violet-700 underline"
                  onClick={() => changeGroup("unconnected")}
                >
                  View {unconnectedCount} unconnected people
                </button>
              )}
            </div>
          ) : (
            <ChartTree
              key={chartKey}
              fitRequest={fitRequest}
              items={items}
              outline={outline}
              storageKey={`ems-chart-camera:${organizationId}:${chartKey}`}
              selectedId={selected}
              renderCard={(id) => {
                const body = bodies.get(id);
                if (body)
                  return (
                    <div className="flex h-full items-center justify-center rounded-xl border-2 border-violet-600 bg-violet-50 p-3 text-center">
                      <div>
                        <strong className="block text-sm text-violet-950">
                          {body}
                        </strong>
                        <span className="text-xs text-violet-700">
                          Reporting body
                        </span>
                      </div>
                    </div>
                  );
                const person = view.byId.get(id)!;
                const kids = (view.children.get(id) ?? []).filter((child) =>
                  view.included.has(child),
                );
                const ownIssues = issueMap.get(id) ?? [];
                return (
                  <div className="relative h-full">
                    <button
                      type="button"
                      aria-label={`Details for ${person.name}`}
                      aria-pressed={selected === id}
                      onClick={() => setSelected(selected === id ? "" : id)}
                      title={[person.name, person.jobTitle, ...ownIssues]
                        .filter(Boolean)
                        .join(" · ")}
                      className={`flex h-full w-full flex-col justify-center overflow-hidden rounded-xl border-2 bg-white p-2.5 text-left shadow-sm ${selected === id ? "border-violet-600 ring-2 ring-violet-200" : ownIssues.length ? "border-amber-400" : "border-slate-300"} ${!view.matches.has(id) ? "border-dashed" : ""}`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <Portrait person={person} />
                        <strong className="line-clamp-2 min-w-0 text-xs leading-4 text-slate-950">
                          {person.name || "Unnamed employee"}
                        </strong>
                      </div>
                      <span className="mt-1 line-clamp-1 w-full text-[11px] text-slate-600">
                        {person.jobTitle || "Job title not set"}
                      </span>
                      <span className="line-clamp-1 w-full text-[10px] text-slate-500">
                        {person.department?.name || "No department"} ·{" "}
                        {person.branch?.name ||
                          person.branchText ||
                          "No branch"}
                      </span>
                      {(ownIssues.length > 0 ||
                        !active(person) ||
                        !view.matches.has(id)) && (
                        <span className="mt-0.5 text-[10px] text-amber-800">
                          {ownIssues.length
                            ? "Reporting needs review"
                            : !active(person)
                              ? "Inactive · reporting context"
                              : "Reporting context"}
                        </span>
                      )}
                    </button>
                    {kids.length > 0 && (
                      <button
                        type="button"
                        className="absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-violet-600 bg-white px-2 py-0.5 text-xs font-semibold text-violet-800 shadow-sm"
                        aria-expanded={open(id)}
                        aria-label={`${open(id) ? "Collapse" : "Expand"} reports of ${person.name}`}
                        onClick={() => toggle(id)}
                      >
                        {open(id) ? "−" : "+"} {kids.length}
                      </button>
                    )}
                  </div>
                );
              }}
            />
          )}
          {issues.length > 0 && (
            <details className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-amber-900">
                {issues.length} reporting issues to review
              </summary>
              <p className="my-2 text-xs">
                Invalid connections are not drawn. Saved assignments have not
                been changed. Select a name to open its reporting group.
              </p>
              <ul className="max-h-60 space-y-1 overflow-auto">
                {issues.map((issue, index) => (
                  <li key={`${issue.employeeId}-${issue.kind}-${index}`}>
                    <button
                      type="button"
                      className="text-left text-sm underline"
                      onClick={() => focusPerson(issue.employeeId)}
                    >
                      {view.byId.get(issue.employeeId)?.name}:{" "}
                      {issueLabels[issue.kind] ?? issue.kind}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <footer className="text-xs text-slate-500">
            Source: {data.source} · Last refreshed:{" "}
            {data.refreshedAt
              ? new Date(data.refreshedAt).toLocaleString()
              : "—"}
            <p className="mt-1">
              Overview folds deeper teams; use + or Show all to expand them. Fit
              includes every displayed card. Group counts follow your filters.
              Statistics cover both groups; layers include reporting context.
              Profile access follows your existing permissions.
            </p>
          </footer>
        </>
      )}
      {detail && (
        <section
          role="region"
          aria-label="Selected person details"
          className="fixed bottom-4 right-4 z-40 max-h-[48vh] w-[calc(100vw-2rem)] max-w-sm overflow-auto rounded-2xl border border-violet-300 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <Portrait person={detail} />
              <div className="min-w-0">
                <h2 className="break-words font-semibold">{detail.name}</h2>
                <p className="text-sm text-slate-600">
                  {detail.jobTitle || "Job title not set"}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-sm text-violet-700 underline"
              onClick={() => setSelected("")}
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-sm">
            {detail.department ? (
              <Link
                href="/ems/departments"
                className="text-violet-700 underline"
                onClick={() => savePosition(detail.id)}
              >
                {detail.department.name}
              </Link>
            ) : (
              "No department"
            )}{" "}
            · {detail.branch?.name || detail.branchText || "No branch"}
          </p>
          <p className="mt-2 text-sm">
            Reports to:{" "}
            {detail.managerId
              ? view.byId.get(detail.managerId)?.name || "Unavailable manager"
              : bodyLabels[detail.reportsToBody ?? ""] || "Not assigned"}
          </p>
          {!view.connected.has(detail.id) && (
            <p className="mt-2 text-xs text-amber-800">
              This reporting chain is unconnected; an assignment in the chain
              needs review.
            </p>
          )}
          {!active(detail) && (
            <p className="mt-2 text-xs text-amber-800">Inactive employee</p>
          )}
          {(issueMap.get(detail.id) ?? []).map((message) => (
            <p key={message} className="mt-1 text-xs text-amber-800">
              {message}
            </p>
          ))}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/ems/employees/${encodeURIComponent(detail.id)}`}
              onClick={() => savePosition(detail.id)}
              className="font-semibold text-violet-700 underline"
            >
              Open profile
            </Link>
            <button
              type="button"
              className="font-semibold text-violet-700 underline"
              onClick={() => {
                focusPerson(detail.id);
                setSelected("");
              }}
            >
              Focus team
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
