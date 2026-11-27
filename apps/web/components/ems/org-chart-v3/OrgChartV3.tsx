"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { readOrgChart } from "@/services/ems-org-chart.service";
import { EmsService } from "@/services/ems.service";
import { ChartCanvas, type Camera, type CanvasCommand } from "./ChartCanvas";
import { GroupPicker } from "./GroupPicker";
import { ChartColours } from "./ChartColours";
import { ChartSearch } from "./ChartSearch";
import { OpenTeams } from "./OpenTeams";
import { PersonDetails, type LoadEmployment } from "./PersonDetails";
import { Portrait } from "./PersonCard";
import {
  BODY,
  ISSUE,
  active,
  branchKey,
  branchName,
  buildView,
  coloursFor,
  assignColourSlots,
  refreshView,
  colourKey,
  personColour,
  outlineRows,
  human,
  indexChart,
  initialState,
  layoutChart,
  openTeamsInDrawing,
  readView,
  normaliseBranchView,
  viewUrl,
  type ChartData,
  type ViewState,
  OTHER_COLOUR,
  UNRECORDED_COLOUR,
  colourGroups,
} from "./model";
import {
  printDocument,
  printOutlineDocument,
  printTiles,
  type PrintMode,
} from "./print";
import styles from "./chart-v3.module.css";
import {
  canViewDepartments,
  departmentFromChartHref,
  ORG_CHART_PATH,
} from "../organisation-navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table } from "@/components/ui/table";

export function OrgChartV3() {
  const { accessToken, user } = useAuthStore();
  const chart = useQuery({
    queryKey: ["ems-chart-v3", user?.organizationId, user?.userId, user?.roleLevel],
    queryFn: ({ signal }) => readOrgChart(accessToken!, signal),
    enabled: !!accessToken && !!user?.organizationId,
    staleTime: 30_000,
  });
  const myself = useQuery({
    queryKey: ["ems-chart-self", user?.organizationId, user?.userId, user?.roleLevel],
    queryFn: async () =>
      (await EmsService.getMyProfile(accessToken!)).employee?.id || null,
    enabled: !!accessToken && !!user?.organizationId,
    staleTime: 30_000,
    retry: false,
  });
  const loadEmployment = useCallback<LoadEmployment>(
    async (id) => {
      const { employee: p } = await EmsService.getEmployee(id, accessToken!);
      // Keep only employment details in this chart cache; personal/contact data stays on the profile.
      return {
        employeeCode: p.employeeCode,
        employmentType: p.employmentType,
        workStation: p.workStation,
        section: p.section,
        subSection: p.subSection,
        shift: p.shift,
        level: p.level,
        grade: p.grade,
        primaryWorkRole: p.primaryWorkRole,
        jobDescription: p.jobDescription,
      };
    },
    [accessToken],
  );
  const canReadEmployment = canViewDepartments(user?.roleLevel);
  if (chart.isPending)
    return <p role="status">Loading the organisation chart…</p>;
  if (chart.isError || !chart.data)
    return (
      <div role="alert">
        <p>Unable to load the organisation chart.</p>
        <Button variant="ghost" type="button" onClick={() => void chart.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <ChartV3
      key={`${user?.organizationId}:${user?.userId}:${user?.roleLevel}`}
      data={chart.data}
      selfId={myself.data || ""}
      selfLoading={myself.isPending}
      selfError={myself.isError}
      onRetrySelf={() => void myself.refetch()}
      identity={`${user?.organizationId}:${user?.userId}:${user?.roleLevel}`}
      companyName={user?.organizationName || "Organisation"}
      timeZone={user?.organizationTimeZone || "UTC"}
      loadEmployment={canReadEmployment ? loadEmployment : undefined}
      canReadDepartments={canReadEmployment}
      refreshing={chart.isFetching}
      refreshError={chart.isError}
      onRefresh={() => void chart.refetch()}
    />
  );
}

type TeamOrigin = {
  url: string;
  state: ViewState;
  camera?: Camera;
  detailsOpen: boolean;
  personOpen: boolean;
};

type Saved = {
  url: string;
  state: ViewState;
  camera?: Camera;
  detailsOpen: boolean;
  personOpen: boolean;
  version: 2 | 3;
  layout?: 4;
  teamOrigin?: TeamOrigin;
};
const validCamera = (c: Camera | undefined): c is Camera =>
  !!c && [c.zoom, c.x, c.y].every(Number.isFinite) && c.zoom > 0 && c.zoom <= 2;
export function ChartV3({
  data,
  identity,
  companyName,
  timeZone,
  loadEmployment,
  canReadDepartments = false,
  onRefresh,
  selfId = "",
  selfLoading = false,
  selfError = false,
  onRetrySelf,
  refreshing = false,
  refreshError = false,
}: {
  data: ChartData;
  selfId?: string;
  selfLoading?: boolean;
  selfError?: boolean;
  onRetrySelf?: () => void;
  identity: string;
  companyName: string;
  timeZone: string;
  loadEmployment?: LoadEmployment;
  canReadDepartments?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  refreshError?: boolean;
}) {
  const index = useMemo(() => indexChart(data), [data]);
  const [state, setState] = useState<ViewState>(initialState),
    [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState(""),
    [detailsOpen, setDetailsOpen] = useState(false),
    [personOpen, setPersonOpen] = useState(false),
    [recent, setRecent] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false),
    [printMode, setPrintMode] = useState<PrintMode>("pages"),
    [printError, setPrintError] = useState(""),
    [notice, setNotice] = useState("");
  const [command, setCommand] = useState<CanvasCommand>({
    serial: 0,
    kind: "overview",
  });
  const [expandedChart, setExpandedChart] = useState(false);
  const [phoneDetails, setPhoneDetails] = useState(false);
  const detailsReturnExpanded = useRef(false);
  useEffect(() => {
    const sync = () => setPhoneDetails(window.innerWidth <= 760);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  const expandTrigger = useRef<HTMLButtonElement>(null);
  const canvasSection = useRef<HTMLElement>(null),
    personSection = useRef<HTMLDivElement>(null),
    printDialog = useRef<HTMLDialogElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    listOrigin = useRef<ViewState | null>(null),
    outlineList = useRef<HTMLUListElement>(null);
  const initialised = useRef(false);
  const teamOrigin = useRef<TeamOrigin | undefined>(undefined);
  const previousIndex = useRef(index);
  const camera = useRef<Camera | undefined>(undefined),
    stateRef = useRef(state),
    indexRef = useRef(index),
    detailRef = useRef({ detailsOpen, personOpen });
  stateRef.current = state;
  indexRef.current = index;
  detailRef.current = { detailsOpen, personOpen };
  const initialCameraCommand = (next: ViewState): CanvasCommand["kind"] => {
    if (next.selected) return "readable";
    const roots = buildView(indexRef.current, next).roots;
    return next.expanded.every((id) => roots.includes(id)) ? "overview" : "fit";
  };
  const storageKey = `ems-chart-v3:v2:${identity}`;
  const normalise = (next: ViewState) =>
    normaliseBranchView(data.capabilities?.inactivePeople ? next : {...next, inactive: false, inactiveOnly: false}, [...indexRef.current.byId.values()]);
  const sameSavedView = (
    saved: Saved | null | undefined,
    next: ViewState,
  ): saved is Saved =>
    (saved?.version === 2 || saved?.version === 3) &&
    typeof saved.url === "string" &&
    Array.isArray(saved.state?.expanded) &&
    viewUrl(normalise(readView(saved.url))) === viewUrl(next);
  const restoredOrigin = (saved: Saved | null | undefined) => {
    const origin = saved?.teamOrigin;
    if (!origin || !Array.isArray(origin.state?.expanded)) return undefined;
    const state = normalise(origin.state);
    return { ...origin, state, url: viewUrl(state) };
  };

  const snapshot = useCallback(
    (): Saved => ({
      version: 3,
      layout: 4,
      url: viewUrl(stateRef.current),
      state: stateRef.current,
      camera: camera.current,
      ...detailRef.current,
      teamOrigin: stateRef.current.isolate ? teamOrigin.current : undefined,
    }),
    [],
  );
  const save = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const saved = snapshot();
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {}
    try {
      if (
        [ORG_CHART_PATH, `${ORG_CHART_PATH}-v3`].includes(
          window.location.pathname,
        )
      )
        window.history.replaceState(
          { ...window.history.state, emsChartV3: saved },
          "",
          window.location.href,
        );
    } catch {}
  }, [snapshot, storageKey]);
  const request = (kind: CanvasCommand["kind"], id?: string, c?: Camera) =>
    setCommand((previous) => ({
      serial: previous.serial + 1,
      kind,
      id,
      camera: c,
    }));
  const searchText = (s: ViewState, i = indexRef.current) =>
    s.query || (s.searchPicked ? i.byId.get(s.selected)?.name || "" : "");
  const update = (next: ViewState, push = true) => {
    next = normalise(next);
    next = {
      ...next,
      searchPicked: !!(next.searchPicked && next.selected && !next.query),
    };
    if (push) save();
    if (stateRef.current.searchPicked || next.searchPicked)
      setInput(searchText(next));
    stateRef.current = next;
    setState(next);
    const url = `${window.location.pathname}?${viewUrl(next)}`;
    const value = {
      ...window.history.state,
      emsChartV3: { ...snapshot(), state: next, url: viewUrl(next) },
    };
    if (push) window.history.pushState(value, "", url);
    else window.history.replaceState(value, "", url);
  };
  const openedFor = (s: ViewState, i = index) => {
    const v = buildView(i, s);
    return [
      ...new Set([
        ...v.roots,
        ...[...v.matches].flatMap((id) =>
          s.query ||
          s.departments.length ||
          s.branch ||
          s.issuesOnly ||
          s.inactiveOnly ||
          s.isolate
            ? i.ancestors(id)
            : [],
        ),
        ...(s.selected ? i.ancestors(s.selected) : []),
      ]),
    ];
  };
  const restoreSelection = (next: ViewState, i = index) => {
    if (!next.selected) return next;
    const person = i.byId.get(next.selected);
    if (!person) return { ...next, selected: "", searchPicked: false };
    if (buildView(i, next).included.has(person.id)) return next;
    return {
      ...next,
      scope: i.connected.has(person.id)
        ? ("connected" as const)
        : ("unconnected" as const),
      inactive: next.inactive || !active(person),
      inactiveOnly: next.inactiveOnly && !active(person),
      query: "",
      isolate: "",
      issuesOnly: false,
      departments: next.departments.includes(person.department?.id || "")
        ? next.departments
        : [],
      branch: next.branch === branchKey(person) ? next.branch : "",
    };
  };
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      const next = normalise(readView(window.location.search));
      let sessionSaved: Saved | null = null;
      try {
        sessionSaved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      } catch {}
      const historySaved = window.history.state?.emsChartV3 as
        | Saved
        | undefined;
      const saved = sameSavedView(historySaved, next)
        ? historySaved
        : sameSavedView(sessionSaved, next)
          ? sessionSaved
          : null;
      teamOrigin.current = next.isolate ? restoredOrigin(saved) : undefined;
      if (saved) {
        const wasSelected = next.selected;
        Object.assign(next, refreshView(index, index, next));
        if (wasSelected && !next.selected)
          setNotice(
            "The saved selection is no longer in this view. Your filters have been kept.",
          );
        next.expanded = saved.state.expanded.filter((id) => index.byId.has(id));
        if (next.selected)
          next.expanded = [
            ...new Set([...next.expanded, ...index.ancestors(next.selected)]),
          ];
        setDetailsOpen(!!next.selected && saved.detailsOpen);
        setPersonOpen(!!next.selected && saved.personOpen);
        // Restore the camera on refresh/Back or an explicit return from a department.
        // A new visit still fits opened teams. Version 2 used an unfitted startup.
        if (
          (saved === historySaved ||
            new URLSearchParams(window.location.search).get("chartReturn") ===
              "1") &&
          saved.version === 3 &&
          saved.layout === 4 &&
          validCamera(saved.camera)
        ) {
          camera.current = saved.camera;
          request("restore", undefined, saved.camera);
        } else request(initialCameraCommand(next), next.selected);
      } else {
        Object.assign(next, restoreSelection(next));
        if (!window.location.search && !index.connected.size)
          next.scope = "unconnected";
        next.expanded = openedFor(next);
        if (next.selected) {
          setDetailsOpen(true);
          setPersonOpen(true);
        }
        request(initialCameraCommand(next), next.selected);
      }
      update(next, false);
      setInput(searchText(next));
      setHydrated(true);
    }
    const back = () => {
      const next = normalise(readView(window.location.search));
      const candidate = window.history.state?.emsChartV3 as Saved | undefined;
      const saved = sameSavedView(candidate, next) ? candidate : undefined;
      teamOrigin.current = next.isolate ? restoredOrigin(saved) : undefined;
      const wasSelected = next.selected;
      Object.assign(
        next,
        saved
          ? refreshView(indexRef.current, indexRef.current, next)
          : restoreSelection(next, indexRef.current),
      );
      next.expanded =
        (saved?.version === 2 || saved?.version === 3) &&
        Array.isArray(saved.state?.expanded)
          ? saved.state.expanded.filter((id) => indexRef.current.byId.has(id))
          : openedFor(next, indexRef.current);
      if (next.selected)
        next.expanded = [
          ...new Set([
            ...next.expanded,
            ...indexRef.current.ancestors(next.selected),
          ]),
        ];
      stateRef.current = next;
      setState(next);
      setInput(searchText(next));
      setDetailsOpen(!!next.selected && (saved?.detailsOpen ?? true));
      setPersonOpen(!!next.selected && !!saved?.personOpen);
      setRecent([]);
      setNotice(
        wasSelected && !next.selected
          ? "The saved selection is no longer in this view. Your filters have been kept."
          : "",
      );
      if (
        saved?.version === 3 &&
        saved.layout === 4 &&
        validCamera(saved.camera)
      ) {
        camera.current = saved.camera;
        request("restore", undefined, saved.camera);
      } else request(initialCameraCommand(next), next.selected);
      window.history.replaceState(
        {
          ...window.history.state,
          emsChartV3: { ...snapshot(), state: next, url: viewUrl(next) },
        },
        "",
        `${window.location.pathname}?${viewUrl(next)}`,
      );
    };
    window.addEventListener("popstate", back);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("popstate", back);
      window.removeEventListener("pagehide", save);
    };
    // Company/user/role remounts this component. Data refresh retains the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (hydrated) save();
  }, [state, detailsOpen, personOpen, hydrated, save]);
  useEffect(() => {
    if (!hydrated) return;
    return () => save();
  }, [hydrated, save]);
  useEffect(() => {
    const d = printDialog.current;
    if (!d) return;
    if (printOpen && !d.open) d.showModal();
    if (!printOpen && d.open) d.close();
  }, [printOpen]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !printOpen && !e.defaultPrevented) {
        if (expandedChart) setExpandedChart(false);
        else setDetailsOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [printOpen, expandedChart]);
  useEffect(() => {
    if (!expandedChart || !canvasSection.current) return;
    const frame = canvasSection.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const outside: { element: HTMLElement; inert: boolean }[] = [];
    let child: HTMLElement = frame;
    while (child.parentElement && child !== document.body) {
      for (const sibling of Array.from(child.parentElement.children)) {
        if (sibling !== child && sibling instanceof HTMLElement) {
          outside.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      child = child.parentElement;
    }
    expandTrigger.current?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || printDialog.current?.open) return;
      const targets = Array.from(
        frame.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter(
        (el) => !el.closest("[hidden]") && el.getClientRects().length > 0,
      );
      const first = targets[0],
        last = targets[targets.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !frame.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !frame.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    frame.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      outside.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      frame.removeEventListener("keydown", trap);
      if (previousFocus?.isConnected && previousFocus !== document.body)
        previousFocus.focus({ preventScroll: true });
      else
        requestAnimationFrame(() =>
          expandTrigger.current?.focus({ preventScroll: true }),
        );
    };
  }, [expandedChart]);
  useEffect(() => {
    if (!hydrated || previousIndex.current === index) return;
    const current = stateRef.current;
    const next = refreshView(previousIndex.current, index, current);
    previousIndex.current = index;
    if (current.selected && !next.selected) {
      setDetailsOpen(false);
      setPersonOpen(false);
      setNotice(
        index.byId.has(current.selected)
          ? "The selected person no longer matches this view. Your filters have been kept."
          : "The previously selected person is no longer in the loaded chart.",
      );
    }
    if (current.isolate && !index.byId.has(current.isolate))
      setNotice(
        "This team's starting person is no longer in the loaded chart. Exit team view to see the wider organisation.",
      );
    if (JSON.stringify(next) !== JSON.stringify(current)) update(next, false);
    if (current.searchPicked) setInput(searchText(next, index));
    // A refresh reconciles selection, new matching paths and colour choices without adding a history entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hydrated]);
  const view = useMemo(
    () =>
      buildView(index, {
        scope: state.scope,
        departments: state.departments,
        branch: state.branch,
        inactive: state.inactive,
        inactiveOnly: state.inactiveOnly,
        issuesOnly: state.issuesOnly,
        query: state.query,
        isolate: state.isolate,
      }),
    [
      index,
      state.scope,
      state.departments,
      state.branch,
      state.inactive,
      state.inactiveOnly,
      state.issuesOnly,
      state.query,
      state.isolate,
    ],
  );
  const noSearchResults = !!state.query.trim() && !view.matches.size;
  const open = useMemo(() => new Set(state.expanded), [state.expanded]);
  const drawing = useMemo(
    () => layoutChart(index, view.included, open),
    [index, view.included, open],
  );
  const shownTeams = useMemo(
    () => openTeamsInDrawing(index, drawing, open),
    [index, drawing, open],
  );
  const outline = useMemo(() => outlineRows(index, drawing), [index, drawing]);
  const selected = view.included.has(state.selected)
      ? index.byId.get(state.selected)
      : undefined,
    listView = state.listView;
  useEffect(() => {
    if (listView && state.selected)
      outlineList.current
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [listView, state.selected]);
  const colours = useMemo(
    () =>
      coloursFor(
        data.people,
        state.colourBy,
        state.colourFocus,
        state.colourMode === "custom",
        state.colourSlots,
        state.colourTone,
      ),
    [
      data.people,
      state.colourBy,
      state.colourFocus,
      state.colourMode,
      state.colourSlots,
      state.colourTone,
    ],
  );
  const colourLegend = useMemo(
    () =>
      colourKey(
        drawing.nodes.flatMap((n) => {
          const person = index.byId.get(n.id);
          return person ? [person] : [];
        }),
        colours,
        state.colourBy,
      ),
    [drawing, index, colours, state.colourBy],
  );
  const allGroups = useMemo(() => {
    const { main, others } = colourGroups(data.people, state.colourBy);
    return [...main, ...others];
  }, [data.people, state.colourBy]);
  const smallerGroups = useMemo(
    () =>
      colourGroups(data.people, state.colourBy).others.map((group) => group.id),
    [data.people, state.colourBy],
  );
  const changeColours = (
    mode: ViewState["colourMode"],
    ids: string[],
    tone: ViewState["colourTone"] = state.colourTone,
  ) => {
    const valid = new Set(allGroups.map((g) => g.id));
    const focus = [...new Set(ids)].filter((id) => valid.has(id)).slice(0, 13);
    const previous =
      state.colourMode === "main"
        ? allGroups.slice(0, 13).map((g) => g.id)
        : assignColourSlots(state.colourFocus, state.colourSlots);
    update(
      {
        ...state,
        colourMode: mode,
        colourTone: mode === "main" ? "standard" : tone,
        colourFocus: mode === "main" ? [] : focus,
        colourSlots: mode === "main" ? [] : assignColourSlots(focus, previous),
      },
      false,
    );
  };
  const myself = index.byId.get(selfId);
  const personalMatches = useMemo(
    () =>
      new Set(
        myself && state.personal
          ? data.people
              .filter((p) =>
                state.personal === "department"
                  ? !!myself.department?.id &&
                    p.department?.id === myself.department.id
                  : !!branchKey(myself) && branchKey(p) === branchKey(myself),
              )
              .map((p) => p.id)
          : [],
      ),
    [data.people, myself, state.personal],
  );
  const searchable = useMemo(
    () => buildView(index, { ...state, query: "" }).matching,
    [index, state],
  );
  const scopeMatches = useMemo(
    () =>
      buildView(index, { ...state, scope: "all", isolate: "", query: "" })
        .matching,
    [index, state],
  );
  const connectedCount = scopeMatches.filter((p) =>
      index.connected.has(p.id),
    ).length,
    unconnectedCount = scopeMatches.length - connectedCount;
  const departments = [
    ...new Map(
      data.people
        .filter((p) => p.department)
        .map((p) => [p.department!.id, p.department!.name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const branches = useMemo(() => {
    const { main, others } = colourGroups(data.people, "branch");
    return [...main, ...others]
      .map((g) => [g.id, g.name] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.people]);
  const filterView = (patch: Partial<ViewState>, fit = true) => {
    const next = { ...state, ...patch, selected: "", expanded: [] as string[] };
    next.expanded = [...new Set([...state.expanded, ...openedFor(next)])];
    update(next);
    setDetailsOpen(false);
    setPersonOpen(false);
    setRecent([]);
    setNotice("");
    request(fit ? "fit" : "readable", buildView(index, next).matching[0]?.id);
  };
  const pick = (id: string, fromSearch = false, moveSpotter = false) => {
    const p = index.byId.get(id);
    if (!p) return;
    const inCurrent = fromSearch
      ? searchable.some((person) => person.id === id)
      : view.included.has(id);
    const next = {
      ...state,
      query: fromSearch ? "" : state.query,
      searchPicked: fromSearch,
      selected: id,
      inactive: state.inactive || !active(p),
      expanded: [...new Set([...state.expanded, ...index.ancestors(id)])],
    };
    if (!inCurrent) {
      next.scope = index.connected.has(id) ? "connected" : "unconnected";
      next.departments = [];
      next.branch = "";
      next.query = "";
      next.issuesOnly = false;
      next.isolate = "";
      next.inactiveOnly = state.inactiveOnly && !active(p);
      setInput("");
      setNotice(
        `Filters cleared to show ${p.name}. Browser Back returns to the previous view.`,
      );
    }
    update(next, !moveSpotter);
    setDetailsOpen(true);
    setPersonOpen(true);
    request(fromSearch ? "centre" : "spot", id);
    if (fromSearch) {
      setNotice("");
      revealChart();
    }
  };
  const isolate = (id: string) => {
    if (!state.isolate) {
      teamOrigin.current = {
        url: viewUrl(state),
        state,
        camera: camera.current,
        detailsOpen,
        personOpen,
      };
    }
    const next = {
      ...state,
      scope: "all" as const,
      departments: [],
      branch: "",
      query: "",
      issuesOnly: false,
      isolate: id,
      searchPicked: false,
      selected: id,
      expanded: [...new Set([...index.ancestors(id), id])],
    };
    update(next);
    setInput("");
    setDetailsOpen(true);
    setNotice("");
    request("readable", id);
    canvasSection.current?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  };
  const showPerson = () => {
    detailsReturnExpanded.current = expandedChart;
    setExpandedChart(false);
    setPersonOpen(true);
    requestAnimationFrame(() => {
      personSection.current
        ?.querySelector<HTMLElement>('[aria-label="Selected person and team"]')
        ?.focus({ preventScroll: true });
      personSection.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
  };
  const backToChart = () => {
    const expand = detailsReturnExpanded.current;
    detailsReturnExpanded.current = false;
    if (expand) setExpandedChart(true);
    requestAnimationFrame(() => {
      const frame = canvasSection.current;
      (
        frame?.querySelector<HTMLElement>("[data-chart-viewport]") ||
        frame?.querySelector<HTMLElement>("button")
      )?.focus({ preventScroll: true });
      frame?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const onCamera = useCallback(
    (value: Camera) => {
      camera.current = value;
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        persistTimer.current = null;
        save();
      }, 250);
    },
    [save],
  );
  const toggle = (id: string) => {
    const expanded = new Set(state.expanded),
      closing = expanded.has(id);
    if (closing) expanded.delete(id);
    else expanded.add(id);
    const hidesSelected =
      closing && index.ancestors(state.selected).includes(id);
    update(
      {
        ...state,
        expanded: [...expanded],
        selected: hidesSelected ? "" : state.selected,
      },
      false,
    );
    if (hidesSelected) {
      setDetailsOpen(false);
      setPersonOpen(false);
    }
    setRecent((r) =>
      closing
        ? r.filter((x) => x !== id)
        : [id, ...r.filter((x) => x !== id)].slice(0, 2),
    );
  };
  const reset = () => {
    const next = initialState();
    next.scope = index.connected.size ? "connected" : "unconnected";
    next.colourBy = state.colourBy;
    next.expanded = buildView(index, next).roots;
    update(next);
    setInput("");
    setDetailsOpen(false);
    setPersonOpen(false);
    setRecent([]);
    setNotice("");
    request("overview");
  };
  const overview = () => {
    update({ ...state, expanded: view.roots, selected: "" }, false);
    setDetailsOpen(false);
    setPersonOpen(false);
    setRecent([]);
    request("overview");
  };
  const clearSearch = () => {
    setInput("");
    update({ ...state, query: "", searchPicked: false });
    if (noSearchResults)
      request(
        validCamera(camera.current) ? "restore" : "fit",
        undefined,
        camera.current,
      );
  };
  const applySearch = () => {
    const query = input.trim();
    if (!query) {
      clearSearch();
      return;
    }
    const next = { ...state, query, searchPicked: false };
    const v = buildView(index, next);
    next.expanded = v.matches.size
      ? [...new Set([...state.expanded, ...openedFor(next)])]
      : state.expanded;
    next.selected = v.matching[0]?.id || "";
    update(next);
    setDetailsOpen(!!next.selected);
    setPersonOpen(!!next.selected);
    setRecent([]);
    setNotice("");
    request("fit");
    revealChart();
  };
  const findMe = () => {
    if (!myself) return;
    pick(myself.id);
    revealChart();
  };
  const highlightMine = (kind: "department" | "branch") => {
    if (!myself) return;
    const next = {
      ...state,
      personal: state.personal === kind ? ("" as const) : kind,
    };
    if (next.personal) {
      next.scope = "all";
      next.departments = [];
      next.branch = "";
      next.query = "";
      next.isolate = "";
      next.issuesOnly = false;
      next.inactive = state.inactive || !active(myself);
      next.inactiveOnly = state.inactiveOnly && !active(myself);
      const v = buildView(index, next);
      const ids = [...v.audience].filter((id) =>
        kind === "department"
          ? index.byId.get(id)?.department?.id === myself.department?.id
          : branchKey(index.byId.get(id)!) === branchKey(myself),
      );
      next.expanded = [
        ...new Set([
          ...state.expanded,
          ...v.roots,
          ...ids.flatMap((id) => index.ancestors(id)),
        ]),
      ];
      setInput("");
      setNotice(
        `Highlighting your ${kind}. Other people remain visible; filters and search were cleared.`,
      );
    }
    update(next);
    request("fit");
  };
  const revealChart = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        canvasSection.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
            ?.matches
            ? "auto"
            : "smooth",
        }),
      ),
    );
  const filterCount =
    state.departments.length +
    Number(!!state.branch) +
    Number(state.inactive) +
    Number(state.issuesOnly);
  const clearFilters = () => {
    const next = {
      ...state,
      departments: [],
      branch: "",
      inactive: false,
      inactiveOnly: false,
      issuesOnly: false,
    };
    if (next.selected && !buildView(index, next).included.has(next.selected)) {
      next.selected = "";
      setDetailsOpen(false);
      setPersonOpen(false);
    }
    next.expanded = [...new Set([...next.expanded, ...openedFor(next)])];
    update(next);
    request("fit");
    setNotice("Filters cleared. Opened teams retained.");
  };
  const exitTeam = () => {
    const origin = teamOrigin.current;
    if (origin) {
      const previous = readView(`?${origin.url}`);
      previous.expanded = origin.state.expanded.filter((id) =>
        index.byId.has(id),
      );
      const next = refreshView(index, index, previous);
      update(next);
      setInput(searchText(next));
      setDetailsOpen(!!next.selected && origin.detailsOpen);
      setPersonOpen(!!next.selected && origin.personOpen);
      setRecent([]);
      setNotice("Returned to your previous chart view.");
      request(
        validCamera(origin.camera) ? "restore" : "fit",
        undefined,
        origin.camera,
      );
    } else {
      // A direct team link has no earlier view to restore.
      update({ ...state, isolate: "" });
      setNotice(
        "Showing the wider organisation. This team link had no previous view to restore.",
      );
      request("fit");
    }
    teamOrigin.current = undefined;
    revealChart();
  };
  const matchAt = view.matching.findIndex((p) => p.id === state.selected);
  const moveMatch = (direction: number) => {
    const at =
      matchAt < 0
        ? direction > 0
          ? 0
          : view.matching.length - 1
        : (matchAt + direction + view.matching.length) % view.matching.length;
    if (view.matching[at]) pick(view.matching[at].id, false, true);
  };
  const expandable = [...view.included].filter((id) =>
    (index.children.get(id) || []).some((child) => view.included.has(child)),
  );
  const overviewActive = expandable.every(
    (id) => open.has(id) === view.roots.includes(id),
  );
  const allActive =
    !overviewActive &&
    expandable.length > 0 &&
    expandable.every((id) => open.has(id));
  const switchList = () => {
    if (!listView) listOrigin.current = state;
    update({ ...state, listView: !listView });
    if (listView) {
      const origin = listOrigin.current;
      const changed =
        !origin ||
        [
          "scope",
          "departments",
          "branch",
          "query",
          "isolate",
          "inactive",
          "inactiveOnly",
          "issuesOnly",
        ].some(
          (key) =>
            origin[key as keyof ViewState] !== state[key as keyof ViewState],
        );
      request(
        origin?.selected !== state.selected && state.selected
          ? "centre"
          : changed
            ? "fit"
            : validCamera(camera.current)
              ? "restore"
              : "fit",
        state.selected,
        camera.current,
      );
      listOrigin.current = null;
    }
  };
  const searchArea = [
    state.departments.length
      ? state.departments
          .map(
            (id) =>
              departments.find(([key]) => key === id)?.[1] ||
              "Unavailable department",
          )
          .join(", ")
      : "",
    state.branch
      ? branches.find(([key]) => key === state.branch)?.[1] || state.branch
      : "",
    state.isolate
      ? `${index.byId.get(state.isolate)?.name || "Selected person"}’s team`
      : "",
    state.scope === "unconnected" ? "unconnected people" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const renderViewActions = () => (
    <div className={styles.viewActions} aria-label="Chart view controls">
      <div
        role="group"
        aria-label="Opened teams"
        className={`${styles.viewPresets} ${styles.openingPresets}`}
      >
        <Button variant="ghost"
          type="button"
          aria-pressed={!noSearchResults && overviewActive}
          disabled={noSearchResults}
          title="Show upper reporting levels; on phones, fit the whole overview with name cards"
          onClick={() => {
            overview();
            revealChart();
          }}
        >
          Overview
        </Button>
        <Button variant="ghost"
          type="button"
          aria-pressed={!noSearchResults && allActive}
          disabled={noSearchResults}
          title="Expand all teams within the current filters and fit them"
          onClick={() => {
            update({ ...state, expanded: [...view.included] }, false);
            setRecent([]);
            request("fit");
            revealChart();
          }}
        >
          Show all &amp; fit
        </Button>
      </div>
      {!noSearchResults && (
        <OpenTeams
          teams={shownTeams}
          onLocate={(id) => {
            update({ ...state, selected: id, searchPicked: false }, false);
            setDetailsOpen(true);
            setPersonOpen(true);
            request("centre", id);
          }}
        />
      )}
      <div
        role="group"
        aria-label="Display"
        className={`${styles.viewPresets} ${styles.displayPresets}`}
      >
        <Button variant="ghost"
          type="button"
          aria-label="Chart view"
          aria-pressed={!listView}
          onClick={() => {
            if (listView) switchList();
          }}
        >
          Chart<span className={styles.desktopLabel}> view</span>
        </Button>
        <Button variant="ghost"
          type="button"
          aria-label="List view"
          aria-pressed={listView}
          onClick={() => {
            if (!listView) switchList();
          }}
        >
          List<span className={styles.desktopLabel}> view</span>
        </Button>
      </div>
      <Button variant="ghost"
        className={`${styles.collapseAction} h-auto whitespace-normal`}
        type="button"
        disabled={noSearchResults}
        onClick={() => {
          update({ ...state, expanded: [], selected: "" }, false);
          setDetailsOpen(false);
          setPersonOpen(false);
          request("fit");
        }}
      >
        Collapse all
      </Button>
      {!expandedChart && (
        <Button variant="ghost"
          className={`${styles.expandAction} h-auto whitespace-normal`}
          ref={expandTrigger}
          type="button"
          aria-pressed={expandedChart}
          onClick={() => setExpandedChart((value) => !value)}
        >
          Expand chart
        </Button>
      )}
      {expandedChart && renderColourChooser()}
    </div>
  );
  const shownPeople = drawing.nodes.filter(
    (n) => !n.body && view.audience.has(n.id),
  ).length;
  const contextCount = drawing.nodes.filter(
    (n) => !n.body && !view.audience.has(n.id),
  ).length;
  const renderChartContext = () => (
    <div className={styles.chartContext}>
      <div className={styles.contextSummary}>
        <strong>
          {noSearchResults
            ? "Search results"
            : state.isolate
              ? "Team view"
              : state.scope === "connected"
                ? "Connected hierarchy"
                : state.scope === "unconnected"
                  ? "Unconnected people"
                  : "Company view"}
        </strong>
        {state.isolate && (
          <Button variant="ghost"
            type="button"
            className={`${styles.emphasisAction} h-auto whitespace-normal`}
            onClick={exitTeam}
          >
            Exit team view
          </Button>
        )}
        <span>
          {noSearchResults ? (
            "No matching people"
          ) : (
            <>
              {state.query
                ? `${drawing.nodes.filter((n) => view.matches.has(n.id)).length} of ${view.matches.size} matches for “${state.query}” in ${listView ? "list" : "opened chart"} · `
                : ""}
              {state.inactiveOnly
                ? `${shownPeople} of ${view.audience.size} inactive people shown`
                : `${view.audience.size} ${view.audience.size === 1 ? "person" : "people"} available · ${shownPeople} shown`}
              {contextCount > 0
                ? ` + ${contextCount} reporting ${contextCount === 1 ? "manager" : "managers"} shown for context`
                : ""}
            </>
          )}
        </span>
      </div>
      {data.capabilities?.inactivePeople && <label className={styles.statusChoice} data-active={state.inactive}>
        <span className={styles.desktopLabel}>Employment status</span>
        <span className={styles.mobileLabel} aria-hidden="true">
          Status
        </span>
        <NativeSelect
          aria-label="Employment status"
          value={
            state.inactiveOnly ? "inactive" : state.inactive ? "all" : "active"
          }
          onChange={(e) =>
            filterView({
              inactive: e.target.value !== "active",
              inactiveOnly: e.target.value === "inactive",
              scope: e.target.value === "inactive" ? "all" : state.scope,
            })
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </NativeSelect>
      </label>}
      {(state.query || filterCount > 0) && (
        <div
          className={styles.activeFilters}
          aria-label="Active search and filters"
        >
          {state.query && (
            <Button variant="ghost"
              type="button"
              className={`${styles.clearActive} h-auto whitespace-normal`}
              onClick={clearSearch}
              aria-label={
                noSearchResults ? "Remove search filter" : "Clear search"
              }
            >
              Search: {state.query} ×
            </Button>
          )}
          {state.departments.map((id) => (
            <Button variant="ghost"
              type="button"
              key={id}
              onClick={() =>
                filterView({
                  departments: state.departments.filter((x) => x !== id),
                })
              }
              aria-label={`Remove ${departments.find((d) => d[0] === id)?.[1] || id} filter`}
            >
              {departments.find((d) => d[0] === id)?.[1] || id} ×
            </Button>
          ))}
          {state.branch && (
            <Button variant="ghost" type="button" onClick={() => filterView({ branch: "" })}>
              {branches.find((b) => b[0] === state.branch)?.[1] || state.branch}{" "}
              ×
            </Button>
          )}
          {state.inactive && (
            <Button variant="ghost"
              type="button"
              onClick={() =>
                filterView({ inactive: false, inactiveOnly: false })
              }
            >
              {state.inactiveOnly ? "Inactive only" : "All statuses"} ×
            </Button>
          )}
          {state.issuesOnly && (
            <Button variant="ghost"
              type="button"
              onClick={() => filterView({ issuesOnly: false })}
            >
              Reporting issues ×
            </Button>
          )}
          {filterCount > 0 && (
            <Button variant="ghost"
              type="button"
              className={`${styles.clearActive} h-auto whitespace-normal`}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
      {state.query && view.matching.length > 0 && (
        <div
          className={styles.matchNavigation}
          aria-label="Search match navigation"
        >
          <span role="status" aria-live="polite" aria-atomic="true">
            {matchAt >= 0 ? `${matchAt + 1} of ` : ""}
            {view.matching.length} matches
          </span>
          <Button variant="ghost"
            type="button"
            className={`${styles.emphasisAction} h-auto whitespace-normal`}
            disabled={view.matching.length < 2}
            onClick={() => moveMatch(-1)}
          >
            Previous match
          </Button>
          <Button variant="ghost"
            type="button"
            className={`${styles.emphasisAction} h-auto whitespace-normal`}
            disabled={view.matching.length < 2}
            onClick={() => moveMatch(1)}
          >
            Next match
          </Button>
        </div>
      )}
    </div>
  );
  const renderColourChooser = () => (
    <ChartColours
      key={state.colourBy}
      by={state.colourBy}
      mode={state.colourMode}
      groups={allGroups}
      smaller={smallerGroups}
      selected={state.colourFocus}
      tone={state.colourTone}
      onChange={changeColours}
    />
  );
  const renderColourKey = () => (
    <div
      className={styles.chartKey}
      role="region"
      aria-label="Chart colour key"
    >
      <div className={styles.keyControls}>
        <label className={styles.colourChoice}>
          Colour by
          <NativeSelect
            value={state.colourBy}
            onChange={(e) =>
              update(
                {
                  ...state,
                  colourBy: e.target.value as ViewState["colourBy"],
                  colourMode: "main",
                  colourTone: "standard",
                  colourFocus: [],
                  colourSlots: [],
                },
                false,
              )
            }
          >
            <option value="department">Department</option>
            <option value="branch">Branch / site</option>
          </NativeSelect>
        </label>

        <ChartColours
          part="presets"
          by={state.colourBy}
          mode={state.colourMode}
          groups={allGroups}
          smaller={smallerGroups}
          selected={state.colourFocus}
          tone={state.colourTone}
          onChange={changeColours}
        />
      </div>
      <ul aria-label="Colours in the opened chart" className={styles.keyItems}>
        {colourLegend.map((row) => (
          <li key={row.colour} data-key-colour={row.colour}>
            <i style={{ background: row.colour }} aria-hidden="true" />
            {row.colour === OTHER_COLOUR ? (
              <span title={row.groups.map((g) => g.name).join(", ")}>
                {row.groups.length}{" "}
                {state.colourBy === "department"
                  ? row.groups.length === 1
                    ? "department"
                    : "departments"
                  : row.groups.length === 1
                    ? "branch"
                    : "branches"}{" "}
                in grey
              </span>
            ) : row.colour === UNRECORDED_COLOUR ? (
              <span>Not recorded</span>
            ) : (
              row.groups.map((g) => (
                <Button variant="ghost"
                  key={g.id}
                  type="button"
                  aria-label={`Highlight ${g.name}`}
                  onClick={() => changeColours("custom", [g.id])}
                >
                  {g.name}
                </Button>
              ))
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  const summary = [
    state.scope === "connected"
      ? "Connected hierarchy"
      : state.scope === "unconnected"
        ? "Unconnected people and teams"
        : "Company view",
    state.departments
      .map(
        (key) =>
          departments.find(([id]) => id === key)?.[1] ||
          "Unavailable department",
      )
      .join(", "),
    state.branch ? branches.find(([id]) => id === state.branch)?.[1] : "",
    state.query ? `Search: ${state.query}` : "",
    state.isolate
      ? `Team: ${index.byId.get(state.isolate)?.name || "unavailable person"}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const timestamp = (value: string | Date) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
      }).format(new Date(value));
    } catch {
      return "Time unavailable";
    }
  };
  const print = () => {
    if (noSearchResults) {
      setPrintOpen(false);
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      setPrintError("Allow pop-ups for this site to open the print preview.");
      return;
    }
    win.opener = null;
    win.document.open();
    win.document.write(
      listView
        ? printOutlineDocument(
            outline,
            index,
            `${companyName} · Reporting outline`,
            summary,
            `Printed ${timestamp(new Date())}`,
          )
        : printDocument(
            drawing,
            index,
            colours,
            printMode,
            `${companyName} · Organisation chart`,
            summary,
            `Printed ${timestamp(new Date())}`,
            state.colourBy,
          ),
    );
    win.document.close();
    win.document
      .getElementById("print-chart")
      ?.addEventListener("click", () => win.print());
    setPrintOpen(false);
    setPrintError("");
    win.focus();
  };
  if (!hydrated) return <p role="status">Preparing the chart…</p>;
  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{companyName}</p>
          <h2 className={styles.chartTitle}>Org chart</h2>
        </div>
        <div className={styles.buttonRow}>
          <Button variant="ghost" type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={() => {
              setPrintOpen(true);
              setPrintError("");
            }}
            disabled={noSearchResults || !drawing.nodes.length}
          >
            Print / PDF
          </Button>
        </div>
      </header>
      {refreshError && (
        <p role="alert" className={styles.warning}>
          Refresh failed. Showing the last loaded chart.{" "}
          <Button variant="ghost" type="button" onClick={onRefresh}>
            Retry
          </Button>
        </p>
      )}
      <section className={styles.filters} aria-label="Find and filter people">
        <div className={styles.searchFilters}>
          <ChartSearch
            people={searchable}
            value={input}
            selectedName={
              state.searchPicked
                ? index.byId.get(state.selected)?.name
                : undefined
            }
            onChange={(value) => {
              if (state.searchPicked)
                update({ ...state, searchPicked: false }, false);
              setInput(value);
              if (!value.trim() && state.query) clearSearch();
            }}
            onPick={(id) => pick(id, true)}
            onApply={() => applySearch()}
          />
          <GroupPicker
            label="Departments shown"
            options={departments.map(([id, name]) => ({ id, name }))}
            selected={state.departments}
            onChange={(ids) => filterView({ departments: ids }, true)}
          />
          <label>
            Branch / site
            <NativeSelect
              value={state.branch}
              onChange={(e) => filterView({ branch: e.target.value })}
            >
              <option value="">All branches / sites</option>
              {branches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className={styles.filterRow}>
          <label className={styles.check}>
            <Checkbox
              checked={state.issuesOnly}
              onCheckedChange={(checked) => filterView({ issuesOnly: checked, scope: "all" })
              }
            />
            Reporting issues only
          </label>
          {filterCount > 0 && (
            <Button variant="ghost"
              type="button"
              className={`${styles.clearActive} h-auto whitespace-normal`}
              onClick={clearFilters}
            >
              Clear filters ({filterCount})
            </Button>
          )}
        </div>
        <div
          className={styles.myPlace}
          aria-label="My place in the organisation"
        >
          {myself ? (
            <>
              <Button variant="ghost" type="button" onClick={findMe}>
                Find me
              </Button>
              {myself.department?.id && (
                <Button variant="ghost"
                  type="button"
                  aria-pressed={state.personal === "department"}
                  onClick={() => highlightMine("department")}
                >
                  My department
                </Button>
              )}
              {!!branchKey(myself) && (
                <Button variant="ghost"
                  type="button"
                  aria-pressed={state.personal === "branch"}
                  onClick={() => highlightMine("branch")}
                >
                  My branch
                </Button>
              )}
              {!!state.personal && (
                <span>Your {state.personal} has a teal outline.</span>
              )}
            </>
          ) : selfLoading ? (
            <span>Finding your employee record…</span>
          ) : selfError ? (
            <span>
              Could not find your employee record.{" "}
              <Button variant="ghost" type="button" onClick={onRetrySelf}>
                Retry my details
              </Button>
            </span>
          ) : (
            <span>
              {selfId
                ? "Your employee record is outside the available chart."
                : "No employee record is linked to your account."}
            </span>
          )}
        </div>
        <div
          className={styles.scopeButtons}
          role="group"
          aria-label="Reporting connection"
        >
          {(["connected", "unconnected", "all"] as const).map((scope, n) => (
            <Button variant="ghost"
              type="button"
              key={scope}
              aria-pressed={state.scope === scope}
              onClick={() => filterView({ scope, isolate: "" })}
            >
              {["Connected", "Unconnected", "All"][n]} (
              {[connectedCount, unconnectedCount, scopeMatches.length][n]})
            </Button>
          ))}
        </div>
      </section>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
          <Button variant="ghost"
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notice"
          >
            ×
          </Button>
        </p>
      )}
      <div className={styles.workspaceSettings}>
        <div className={styles.colourSettings}>
          {!expandedChart && renderColourChooser()}
        </div>
        <Button variant="ghost"
          type="button"
          onClick={() => {
            reset();
            revealChart();
          }}
        >
          Reset chart view
        </Button>
      </div>
      <details className={styles.controlsGuide}>
        <summary>Chart controls explained</summary>
        <Table>
          <tbody>
            {[
              [
                "Expand chart",
                "Give the chart the window. Use × Exit at the top right, or press Escape, to return to the page.",
              ],
              [
                "− / +",
                "Zoom one step, keeping the selected person centred. Without a selection, zoom around the centre of the chart.",
              ],
              [
                "Fit",
                "Fit everything currently opened. Keep filters and selection.",
              ],
              [
                "Centre selected",
                "Bring the selected person into view at the current zoom.",
              ],
              [
                "Read card",
                "Zoom close enough to read the selected card. On phones, Zoom back then returns to the view before Read card.",
              ],
              [
                "Zoom out (in person details)",
                "Fit all currently opened people. The − button zooms out one step.",
              ],
              [
                "Collapse all",
                "Close opened teams and fit the top reporting level. Keep filters.",
              ],
              [
                "Employment status",
                "Choose Active, Inactive only or All statuses. Reporting managers may still appear to explain the hierarchy; their details identify them as context.",
              ],
              [
                "Previous / Next match",
                "Move between search matches and update details without changing zoom.",
              ],
              [
                "Overview",
                "Show upper reporting levels. Phones fit them all using name cards. Desktop keeps names readable; use Fit if part extends beyond the window.",
              ],
              [
                "Show all & fit",
                "Expand all teams within the current filters, then fit.",
              ],
              [
                "Clear search",
                "Remove the search and its highlights. Keep other filters, opened teams and zoom. Open teams lists the managers whose teams remain open.",
              ],
              [
                "Open teams",
                "List managers whose direct reports are currently drawn. Locate centres a manager at the same zoom and opens their details. Hidden teams are excluded.",
              ],
              [
                "Exit team view",
                "Return to the filters, search, opened teams and zoom saved before isolating. A directly opened team link has no previous view.",
              ],
              [
                "Clear filters",
                "Return to active people in all departments and branches. Keep search, reporting scope and opened teams.",
              ],
              [
                "Reset chart view",
                "Clear search, filters, temporary highlights and selection. Return to the readable Overview. Employee records are unchanged.",
              ],
              [
                "Chart colours",
                "Largest colours up to 13 groups. Each click on Smaller advances one batch; its arrow and batch number show the next action. A tick means its only batch is already selected. Choose colours lets you pick any mix. People stay visible.",
              ],
            ].map(([name, description]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </details>
      <section
        ref={canvasSection}
        data-expanded={expandedChart}
        role={expandedChart ? "dialog" : undefined}
        aria-modal={expandedChart || undefined}
        aria-label={expandedChart ? "Expanded organisation chart" : undefined}
        className={`${styles.chartSection} ${listView || !view.included.size || noSearchResults ? styles.canvasSection : ""}`}
      >
        {expandedChart && (
          <div className={styles.expandedHeading}>
            <strong>Org chart</strong>
            <Button variant="ghost"
              ref={expandTrigger}
              type="button"
              aria-label="Exit expanded view"
              onClick={() => setExpandedChart(false)}
            >
              <span aria-hidden="true">×</span> Exit
            </Button>
          </div>
        )}
        {(listView || !view.included.size || noSearchResults) && (
          <div className={styles.canvasControls}>
            {renderViewActions()}
            {renderChartContext()}
          </div>
        )}
        {noSearchResults ? (
          <div
            className={styles.noSearchResults}
            role="region"
            aria-label="No search results"
          >
            <h2 role="status">
              No matches for “{state.query}”
              {searchArea ? ` in ${searchArea}` : " in this view"}.
            </h2>
            <p>
              Your filters are still applied. Clear the search to see this group
              again, or widen a filter.
            </p>
            <div className={styles.buttonRow}>
              <Button variant="ghost"
                type="button"
                className={`${styles.primary} h-auto whitespace-normal`}
                onClick={clearSearch}
              >
                Clear search
              </Button>
              {!!state.departments.length && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => filterView({ departments: [] })}
                >
                  Search all departments
                </Button>
              )}
              {!!state.branch && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => filterView({ branch: "" })}
                >
                  Search all branches / sites
                </Button>
              )}
            </div>
          </div>
        ) : !view.included.size ? (
          <p className={styles.empty}>
            No people match this view. Change a filter or reset the view.
          </p>
        ) : listView ? (
          <div className={styles.outlineWrap}>
            <div className={styles.outlineHeading}>
              <strong>{outline.length} people displayed</strong>
              <span>Expand a manager to see their team.</span>
            </div>
            <ul
              ref={outlineList}
              className={styles.outline}
              aria-label="Reporting outline"
            >
              {outline.map(({ id, depth }) => {
                const p = index.byId.get(id)!,
                  kids = (index.children.get(id) || []).filter((id) =>
                    view.included.has(id),
                  );
                return (
                  <li
                    key={id}
                    data-selected={state.selected === id}
                    data-search-match={!!state.query && view.matches.has(id)}
                    data-search-muted={!!state.query && !view.matches.has(id)}
                    data-context-muted={
                      state.inactiveOnly &&
                      !view.audience.has(id) &&
                      state.selected !== id
                    }
                    style={{ paddingLeft: 12 + Math.min(depth, 8) * 24 }}
                  >
                    {kids.length ? (
                      <Button variant="ghost"
                        type="button"
                        className={`${styles.outlineToggle} h-auto whitespace-normal`}
                        aria-expanded={open.has(id)}
                        aria-label={`${open.has(id) ? "Close" : "Open"} ${p.name}’s ${kids.length} direct reports`}
                        onClick={() => toggle(id)}
                      >
                        {open.has(id) ? "−" : "+"}
                      </Button>
                    ) : (
                      <span className={styles.outlineSpacer} />
                    )}
                    <Button variant="ghost"
                      type="button"
                      className={`${styles.outlinePerson} h-auto whitespace-normal`}
                      onClick={() => {
                        pick(id);
                        setPersonOpen(true);
                      }}
                      style={{
                        borderLeftColor: personColour(
                          p,
                          colours,
                          state.colourBy,
                        ),
                      }}
                    >
                      <Portrait person={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <span>
                          {p.jobTitle || "Job title not recorded"} ·{" "}
                          {p.department?.name || "No department"}
                          {!active(p) ? " · Inactive" : ""}
                        </span>
                      </span>
                    </Button>
                    {state.query && view.matches.has(id) && (
                      <span className={styles.matchBadge}>Match</span>
                    )}
                    <span className={styles.outlineMeta}>
                      {kids.length ? `${kids.length} direct reports` : ""}
                      {!view.audience.has(id) ? " · reporting context" : ""}
                      {(index.issues.get(id) || []).length
                        ? " · ⚠ Reporting issue"
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <ChartCanvas
            overview={overviewActive}
            actions={renderViewActions()}
            context={renderChartContext()}
            showInactive={state.inactive}
            inactiveOnly={state.inactiveOnly}
            index={index}
            matches={view.audience}
            searchMatches={state.query ? view.matches : undefined}
            personalMatches={personalMatches}
            markerLabel={
              state.query && view.matches.has(state.selected)
                ? `${view.matching.findIndex((p) => p.id === state.selected) + 1} / ${view.matching.length}`
                : state.selected === selfId
                  ? "You"
                  : "Selected"
            }
            colourKey={renderColourKey()}
            included={view.included}
            open={open}
            selected={state.selected}
            colours={colours}
            colourBy={state.colourBy}
            recent={recent}
            command={command}
            onCamera={onCamera}
            onPick={(id) => pick(id)}
            onToggle={toggle}
            mobileDetails={
              selected && detailsOpen && phoneDetails
                ? (controls) => (
                    <aside
                      className={styles.mobileSelection}
                      aria-label="Selected person"
                      style={
                        {
                          "--detail-colour": personColour(
                            selected,
                            colours,
                            state.colourBy,
                          ),
                        } as CSSProperties
                      }
                    >
                      <Button variant="ghost"
                        type="button"
                        className={`${styles.selectionLink} h-auto whitespace-normal`}
                        onClick={showPerson}
                      >
                        <strong>{selected.name}</strong>
                        <span>
                          Employee code:{" "}
                          {selected.employeeCode || "Not recorded"}
                        </span>
                        <span className={styles.selectionDestination}>
                          Person &amp; team ↓
                        </span>
                      </Button>
                      <div className={styles.mobileReadAction}>{controls}</div>
                      <Button variant="ghost"
                        type="button"
                        aria-label="Hide selected person summary"
                        onClick={() => setDetailsOpen(false)}
                      >
                        ×
                      </Button>
                    </aside>
                  )
                : undefined
            }
            details={
              selected && detailsOpen && !phoneDetails ? (
                <aside
                  className={styles.detailPopover}
                  aria-label="Person details"
                  style={
                    {
                      "--detail-colour": personColour(
                        selected,
                        colours,
                        state.colourBy,
                      ),
                    } as CSSProperties
                  }
                >
                  <div className={styles.sectionHeading}>
                    <strong>Person details</strong>
                    <Button variant="ghost"
                      type="button"
                      aria-label="Close person details"
                      onClick={() => setDetailsOpen(false)}
                    >
                      ×
                    </Button>
                  </div>
                  {!view.audience.has(selected.id) && (
                    <p className={styles.contextNote}>
                      Reporting context · This person does not match the current
                      filters, but connects the people who do.
                    </p>
                  )}
                  <div className={styles.popoverPerson}>
                    <Portrait person={selected} />
                    <div>
                      <strong>{selected.name}</strong>
                      <p>{selected.jobTitle || "Job title not recorded"}</p>
                    </div>
                  </div>
                  <p>
                    Employee code: {selected.employeeCode || "Not recorded"}
                  </p>
                  <p>
                    Department: {selected.department?.name || "Not recorded"}
                  </p>
                  <p>Branch / site: {branchName(selected) || "Not recorded"}</p>
                  <p>
                    {selected.status ? human(selected.status) : "Current employee"} ·{" "}
                    {
                      (index.children.get(selected.id) || []).filter(
                        (id) => state.inactive || active(index.byId.get(id)!),
                      ).length
                    }{" "}
                    {state.inactive ? "" : "active "}direct reports
                  </p>
                  <p>
                    Reports to:{" "}
                    {index.parent.get(selected.id)
                      ? index.byId.get(index.parent.get(selected.id)!)?.name
                      : BODY[selected.reportsToBody || ""] || "Not confirmed"}
                  </p>
                  {!!(index.issues.get(selected.id) || []).length && (
                    <p className={styles.warning}>
                      {index.issues
                        .get(selected.id)!
                        .map((k) => ISSUE[k] || k)
                        .join(" · ")}
                    </p>
                  )}
                  <div className={styles.popoverActions}>
                    <div
                      className={styles.buttonRow}
                      aria-label="Selected person zoom"
                    >
                      <Button variant="ghost"
                        type="button"
                        onClick={() => request("readable", selected.id)}
                      >
                        Read card
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        title="Zoom out to fit everyone currently opened"
                        onClick={() => request("fit")}
                      >
                        Zoom out
                      </Button>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      className={`${styles.textButton} h-auto whitespace-normal`}
                      onClick={showPerson}
                    >
                      Go to person & team below ↓
                    </Button>
                    {state.isolate !== selected.id && (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => isolate(selected.id)}
                      >
                        Isolate team
                      </Button>
                    )}
                    {loadEmployment && (
                      <Link
                        href={`/ems/employees/${encodeURIComponent(selected.id)}`}
                      >
                        Open profile
                      </Link>
                    )}
                  </div>
                </aside>
              ) : null
            }
          />
        )}
        {!noSearchResults &&
          (listView || !view.included.size) &&
          renderColourKey()}
      </section>
      {!noSearchResults && (
        <div className={styles.supportRows}>
          <details className={styles.legend}>
            <summary>
              Reporting issues (
              {
                [...index.issues.keys()].filter((id) => view.included.has(id))
                  .length
              }
              )
            </summary>
            <ul className={styles.issueList}>
              {[...index.issues]
                .filter(([id]) => view.included.has(id))
                .map(([id, kinds]) => (
                  <li key={id}>
                    <Button variant="ghost" type="button" onClick={() => pick(id)}>
                      {index.byId.get(id)?.name}
                    </Button>
                    <span>{kinds.map((k) => ISSUE[k] || k).join(" · ")}</span>
                  </li>
                ))}
            </ul>
          </details>
        </div>
      )}
      {!noSearchResults && selected && personOpen && (
        <div ref={personSection} className={styles.personAnchor}>
          <PersonDetails
            key={selected.id}
            person={selected}
            index={index}
            colours={colours}
            colourBy={state.colourBy}
            includeInactive={state.inactive}
            identity={identity}
            loadEmployment={loadEmployment}
            departmentHref={
              canReadDepartments && selected.department
                ? departmentFromChartHref(
                    selected.department.id,
                    viewUrl(state),
                    state.branch,
                  )
                : undefined
            }
            onNavigate={save}
            onPick={(id) => pick(id)}
            onIsolate={() => isolate(selected.id)}
            onClose={() => setPersonOpen(false)}
            onBackToChart={backToChart}
          />
        </div>
      )}
      <p className={styles.source}>
        {data.source || "EMS registered employees"}
        {data.refreshedAt ? ` · Refreshed ${timestamp(data.refreshedAt)}` : ""}
      </p>
      <dialog
        ref={printDialog}
        className={styles.printDialog}
        aria-labelledby="chart-v3-print-title"
        onCancel={() => setPrintOpen(false)}
        onClose={() => setPrintOpen(false)}
      >
        <div className={styles.sectionHeading}>
          <h2 id="chart-v3-print-title">
            Print {listView ? "reporting outline" : "chart"}
          </h2>
          <Button variant="ghost"
            type="button"
            aria-label="Close print options"
            onClick={() => setPrintOpen(false)}
          >
            ×
          </Button>
        </div>
        <p>
          {listView
            ? "Prints the people and expanded teams in this list."
            : "Prints the current view and opened teams. Zoom does not affect printing."}
        </p>
        {!listView && (
          <label>
            Layout
            <NativeSelect
              value={printMode}
              onChange={(e) => setPrintMode(e.target.value as PrintMode)}
            >
              <option value="pages">
                Readable cards across landscape pages
              </option>
              <option value="overview">Whole view on one landscape page</option>
            </NativeSelect>
          </label>
        )}
        <p>
          {outline.length} people
          {listView
            ? ""
            : ` · ${printTiles(drawing, printMode).length} page(s)`}
        </p>
        {!listView && printMode === "overview" && (
          <p className={styles.notice}>
            Large charts have small text on one page. Use readable pages for
            individual names.
          </p>
        )}
        {printError && (
          <p role="alert" className={styles.warning}>
            {printError}
          </p>
        )}
        <div className={styles.buttonRow}>
          <Button variant="ghost" type="button" onClick={() => setPrintOpen(false)}>
            Cancel
          </Button>
          <Button variant="ghost" type="button" className={`${styles.primary} h-auto whitespace-normal`} onClick={print}>
            Open print preview
          </Button>
        </div>
      </dialog>
    </div>
  );
}
