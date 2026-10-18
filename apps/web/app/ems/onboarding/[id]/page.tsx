"use client";
import { DepartmentHodEditor, PersonLinkPicker, PersonLinkStatus } from '@/components/ems/OnboardingPeopleLinks';

import { use, useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo, Fragment, type ChangeEvent } from "react";
import Link from "next/link";
import OnboardingDuplicateReview from "@/components/ems/OnboardingDuplicateReview";
import { safeReviewReturn } from "@/components/ems/onboarding-review-navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingRecord, OnboardingRecordStatus, OnboardingBatchDetail, RECORD_STATUS_LABELS,
  BATCH_STATUS_LABELS, UpdateOnboardingRecordPayload, ReportingOption, ReportingResolution, REPORTING_STATE_LABELS,
  EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS,
} from "@/services/ems.service";
import { requiredFields } from "../column-map";
import {
  ArrowLeft, Loader2, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Ban, Undo2, UserPlus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCountries } from "libphonenumber-js";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const PHONE_COUNTRIES = getCountries().map((code) => ({ code, name: countryNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

const EDITABLE_FIELDS: { key: keyof UpdateOnboardingRecordPayload; label: string }[] = [
  { key: "companyCode",            label: "Company code" },
  { key: "employeeCode",           label: "Employee code" },
  { key: "firstName",              label: "First name" },
  { key: "middleName",             label: "Middle name" },
  { key: "lastName",               label: "Last name" },
  { key: "gender",                 label: "Gender" },
  { key: "nationality",            label: "Nationality" },
  { key: "mobileNumber",           label: "Personal mobile number (login)" },
  { key: "whatsappNumber",         label: "WhatsApp number" },
  { key: "workEmail",              label: "Work email" },
  { key: "plantBranchCode",        label: "Plant / branch" },
  { key: "currentDepartment",      label: "Department" },
  { key: "jobDesignation",         label: "Designation" },
  { key: "workArea",               label: "Work area" },
  { key: "subSection",             label: "Sub-section" },
  { key: "shift",                  label: "Shift" },
  { key: "employmentStatus",       label: "Employment status" },
  { key: "employmentType",         label: "Employment type" },
  { key: "beesAccessLevel",        label: "Access level" },
  { key: "hodName",                label: "HOD name" },
  { key: "hodDesignation",         label: "HOD designation" },
  { key: "reportingToName",        label: "Reporting to" },
  { key: "reportingToDesignation", label: "Reporting to designation" },
  { key: "reliever1Name",          label: "1st reliever" },
  { key: "reliever1Designation",   label: "1st reliever designation" },
  { key: "reliever2Name",          label: "2nd reliever" },
  { key: "reliever2Designation",   label: "2nd reliever designation" },
];

// These choices and aliases follow the supplied onboarding API's accepted values.
// Displaying a recognised alias never rewrites the imported draft by itself.
const EDITOR_CHOICES: Partial<Record<keyof UpdateOnboardingRecordPayload, Record<string, string>>> = {
  gender: {MALE: 'Male', FEMALE: 'Female', OTHER: 'Other'},
  employmentStatus: EMPLOYMENT_STATUS_LABELS,
  employmentType: EMPLOYMENT_TYPE_LABELS,
  beesAccessLevel: {EMPLOYEE: 'Employee', SUPERVISOR: 'Supervisor', MANAGEMENT: 'Management', HOD: 'Head of department', HR: 'HR', ADMIN: 'Admin'},
};
const editorValueKey = (value?: string | null) => (value ?? '').replace(/[\n\r]+/g, ' ').replace(/\([^)]*\)/g, '')
  .replace(/\s*\/\s*/g, ' ').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
function editorBlank(value?: string | null) {
  const key = editorValueKey(value);
  return !value?.trim() || (!key && !/[\p{L}\p{N}]/u.test(value))
    || (['nil', 'none', 'null', 'noinformationavailable', 'noinfo'].includes(key) && !/[^\x00-\x7F]/.test(value));
}
const editorNA = (value?: string | null) => ['na', 'notapplicable'].includes(editorValueKey(value));
function editorChoice(key: keyof UpdateOnboardingRecordPayload, value?: string | null) {
  if (editorBlank(value)) return '';
  if (key !== 'beesAccessLevel' && editorNA(value)) return 'N/A';
  const normalised = editorValueKey(value);
  if (key === 'gender' && ['m', 'f'].includes(normalised)) return normalised === 'm' ? 'MALE' : 'FEMALE';
  if (key === 'beesAccessLevel') {
    const aliases: Record<string, string> = {manager: 'MANAGEMENT', headofdepartment: 'HOD', humanresources: 'HR', administrator: 'ADMIN', systemadministrator: 'ADMIN'};
    if (aliases[normalised]) return aliases[normalised];
  }
  return Object.keys(EDITOR_CHOICES[key] ?? {}).find(choice => editorValueKey(choice) === normalised) ?? '__imported__';
}
type EditorFinding = {message: string; stale: boolean};
function editorFindings(record: OnboardingRecord, draft: UpdateOnboardingRecordPayload,
  required: Set<keyof UpdateOnboardingRecordPayload>, savedDraft: UpdateOnboardingRecordPayload, resolution?: ReportingResolution) {
  const result = new Map<string, EditorFinding[]>();
  const sameValue = (key: keyof UpdateOnboardingRecordPayload) => {
    const original = savedDraft[key];
    return EDITOR_CHOICES[key] ? editorChoice(key, draft[key]) === editorChoice(key, original) && (editorChoice(key, original) !== '__imported__' || draft[key] === original)
      : (editorBlank(draft[key]) ? '' : draft[key]?.trim()) === (editorBlank(original) ? '' : original?.trim());
  };
  const reportingChanged = (draft.reportingTarget ?? '') !== (savedDraft.reportingTarget ?? '')
    || !sameValue('reportingToName') || !sameValue('reportingToDesignation');
  const add = (key: string, message: string, stale: boolean) => {
    const findings = result.get(key) ?? [];
    if (!findings.some(finding => finding.message === message && finding.stale === stale)) result.set(key, [...findings, {message, stale}]);
  };
  for (const finding of record.validationErrors ?? []) {
    if (isChainFinding(finding.field, resolution)) continue;
    const reporting = ['reportingToName', 'reportingToDesignation', 'reportingTarget'].includes(finding.field);
    const key = reporting && (draft.reportingTarget || finding.message === resolution?.error) ? 'reportingTarget' : finding.field;
    add(key, finding.message, reporting ? reportingChanged : key === 'duplicateReview'
      ? (['firstName', 'middleName', 'lastName', 'employeeCode', 'mobileNumber', 'currentDepartment', 'jobDesignation', 'plantBranchCode'] as const).some(field => !sameValue(field))
      : !sameValue(finding.field as keyof UpdateOnboardingRecordPayload));
  }
  if (resolution?.error && resolution.errorScope !== 'UPSTREAM') add('reportingTarget', resolution.error, reportingChanged);
  if (record.status !== 'REGISTERED') {
    const local = (key: string, message: string) => { if (!(result.get(key) ?? []).some(f => !f.stale)) add(key, message, false); };
    for (const key of required) {
      if (draft.reportingTarget && ['reportingToName', 'reportingToDesignation'].includes(key)) continue;
      if (editorNA(draft[key])) local(key, 'This field is required; N/A is not accepted.');
      else if (editorBlank(draft[key]) && !(key === 'reportingToName' && ['board', 'boardofdirectors'].includes(editorValueKey(draft.reportingToDesignation)))) local(key, 'Required');
    }
    for (const key of Object.keys(EDITOR_CHOICES) as (keyof UpdateOnboardingRecordPayload)[]) {
      if (editorChoice(key, draft[key]) === '__imported__') local(key, 'Choose one of the listed values.');
    }
  }
  return result;
}

// A presentation status only: backend eligibility remains unchanged.
function isChainFinding(field: string, resolution?: ReportingResolution) {
  return field === 'reportingToName' && resolution?.errorScope === 'UPSTREAM';
}
function waitingOnChain(record: OnboardingRecord, resolution?: ReportingResolution) {
  return record.status === 'NEEDS_FIXING' && resolution?.errorScope === 'UPSTREAM'
    && !!record.validationErrors?.length
    && record.validationErrors.every(e => isChainFinding(e.field, resolution) && e.message === resolution.error);
}

function needsDuplicateReview(record: OnboardingRecord, resolution?: ReportingResolution) {
  return record.status === 'NEEDS_FIXING' && !!record.duplicateReview?.requiresReview
    && !!record.validationErrors?.length && record.validationErrors.every(finding =>
      finding.field === 'duplicateReview' || isChainFinding(finding.field, resolution));
}

type RecordFilters = { search: string; department: string; status: '' | OnboardingRecordStatus | 'WAITING' | 'NEEDS_REVIEW';
  reportingTarget: string; reportingLabel: string; scope: 'BRANCH' | 'DIRECT' };
const EMPTY_FILTERS: RecordFilters = {search: '', department: '', status: '', reportingTarget: '', reportingLabel: '', scope: 'BRANCH'};
const normaliseFilter = (value: string | null | undefined) => (value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
const departmentKey = (value: string | null) => normaliseFilter(value) ? `department:${normaliseFilter(value)}` : 'MISSING';
const hasFilters = (filters: RecordFilters) => !!(filters.search.trim() || filters.department || filters.status || filters.reportingTarget);

// Use person IDs and known reporting edges. Never infer a link from matching names.
function reportingFilterModel(batch?: OnboardingBatchDetail) {
  const records = batch?.records ?? [];
  const aliases = new Map(records.filter(r => r.status === 'REGISTERED' && r.employeeId)
    .map(r => [`record:${r.id}`, `employee:${r.employeeId}`]));
  const canonical = (target: string) => aliases.get(target) ?? target;
  const parents = new Map<string, string>();
  const people = new Map<string, {target: string; name: string; label: string}>();
  const addPerson = (target: string, name: string, details: (string | null | undefined)[]) => {
    const key = canonical(target);
    if (key !== 'BOARD' && !people.has(key)) people.set(key, {target: key, name,
      label: [name || 'Unnamed person', ...details.filter(Boolean)].join(' · ')});
  };
  for (const record of records) addPerson(`record:${record.id}`, [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' '),
    [record.jobDesignation, record.employeeCode || (record.rowNumber != null ? `Row ${record.rowNumber}` : ''), record.currentDepartment]);
  const options = new Map((batch?.hierarchy.options ?? []).map(option => [canonical(option.target), option]));
  for (const record of records) {
    const resolution = batch?.hierarchy.byRecord[record.id];
    for (const [index, person] of (resolution?.chain ?? []).entries()) {
      const option = options.get(canonical(person.target));
      addPerson(person.target, option?.name || person.name, [option?.designation || person.designation,
        option?.employeeCode || person.employeeCode, option?.department, person.employeeId && !person.recordId ? 'Existing employee' : '']);
      const previous = resolution?.chain?.[index - 1];
      if (previous && !parents.has(canonical(previous.target))) parents.set(canonical(previous.target), canonical(person.target));
    }
    if (resolution?.target) {
      const option = options.get(canonical(resolution.target));
      addPerson(resolution.target, option?.name || resolution.managerName || record.reportingToName || 'Unavailable manager',
        [option?.designation || record.reportingToDesignation, option?.employeeCode, option?.department]);
    }
  }
  // The immediate assignment on each import row is authoritative, including broken links.
  for (const record of records) {
    const target = batch?.hierarchy.byRecord[record.id]?.target;
    const self = canonical(`record:${record.id}`);
    if (target) parents.set(self, canonical(target)); else parents.delete(self);
  }
  const children = new Map<string, Set<string>>();
  for (const [child, parent] of parents) {
    if (!children.has(parent)) children.set(parent, new Set());
    children.get(parent)!.add(child);
  }
  return {canonical, children, people: [...people.values()].sort((a, b) => a.label.localeCompare(b.label))};
}
function matchingRecordIds(batch: OnboardingBatchDetail | undefined, filters: RecordFilters,
  model = reportingFilterModel(batch)) {
  const selected = model.canonical(filters.reportingTarget);
  const branch = new Set<string>();
  if (selected) {
    if (filters.scope === 'DIRECT') for (const child of model.children.get(selected) ?? []) {
      if (child !== selected) branch.add(child);
    } else {
      branch.add(selected);
      const pending = [selected];
      for (let i = 0; i < pending.length; i++) for (const child of model.children.get(pending[i]) ?? []) {
        if (!branch.has(child)) { branch.add(child); pending.push(child); }
      }
    }
  }
  const terms = normaliseFilter(filters.search).split(' ').filter(Boolean);
  return new Set((batch?.records ?? []).filter(record => {
    const nameAndCode = normaliseFilter([record.firstName, record.middleName, record.lastName, record.employeeCode].filter(Boolean).join(' '));
    const status = needsDuplicateReview(record, batch?.hierarchy.byRecord[record.id]) ? 'NEEDS_REVIEW' : waitingOnChain(record, batch?.hierarchy.byRecord[record.id]) ? 'WAITING' : record.status;
    return terms.every(term => nameAndCode.includes(term))
      && (!filters.department || filters.department === departmentKey(record.currentDepartment))
      && (!filters.status || filters.status === status)
      && (!selected || branch.has(model.canonical(`record:${record.id}`)));
  }).map(record => record.id));
}

function RecordStatusPill({ status, waiting = false, review = false }: { status: OnboardingRecordStatus; waiting?: boolean; review?: boolean }) {
  const colour =
    waiting || review ? "bg-amber-100 text-amber-800" :
    status === "REGISTERED"   ? "bg-emerald-100 text-emerald-700" :
    status === "READY"        ? "bg-blue-100 text-blue-700" :
    status === "NEEDS_FIXING" ? "bg-red-100 text-red-700" :
    status === "EXCLUDED"     ? "bg-slate-100 text-slate-400" :
                                "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colour}`}>
      {review ? "Needs review" : waiting ? "Waiting on reporting chain" : RECORD_STATUS_LABELS[status]}
    </span>
  );
}

function reportingTarget(record: OnboardingRecord, resolution?: ReportingResolution) {
  return resolution?.target ?? (record.reportingToBoard ? 'BOARD'
    : record.reportingToRecordId ? `record:${record.reportingToRecordId}`
    : record.reportingToEmployeeId ? `employee:${record.reportingToEmployeeId}` : '');
}
const reportingText = (value?: string | null) => (value ?? '').trim().replace(/\s+/g, ' ');
const importedReportingLabel = (value: UpdateOnboardingRecordPayload | OnboardingRecord) =>
  [reportingText(value.reportingToName), reportingText(value.reportingToDesignation)].filter(Boolean).join(' · ') || 'No name or designation';

// Compare identities, not display names. A record becoming an employee is still the same person.
function reportingIdentities(batches: OnboardingBatchDetail[]) {
  const aliases = new Map<string, string>();
  for (const batch of batches) for (const record of batch.records) {
    if (record.employeeId) aliases.set(`record:${record.id}`, `employee:${record.employeeId}`);
  }
  const canonical = (target: string) => aliases.get(target) ?? target;
  type Person = {name: string; designation: string; code: string; department: string; source: string};
  const people = new Map<string, Person>();
  const add = (target: string, person: Partial<Person>) => {
    if (target === 'BOARD') return;
    const key = canonical(target), previous = people.get(key);
    people.set(key, {name: person.name || previous?.name || '', designation: person.designation || previous?.designation || '',
      code: person.code || previous?.code || '', department: person.department || previous?.department || '',
      source: person.source || previous?.source || ''});
  };
  for (const batch of batches) {
    for (const resolution of Object.values(batch.hierarchy.byRecord)) for (const person of resolution.chain ?? []) {
      add(person.target, {name: person.name, designation: person.designation, code: person.employeeCode});
    }
    for (const option of batch.hierarchy.options) add(option.target, {name: option.name, designation: option.designation,
      code: option.employeeCode, department: option.department, source: option.target.startsWith('employee:') ? 'Existing employee' : ''});
    for (const record of batch.records) add(`record:${record.id}`, {name: [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' '),
      designation: record.jobDesignation ?? '', code: record.employeeCode ?? '', department: record.currentDepartment ?? '',
      source: record.rowNumber != null ? `Import row ${record.rowNumber}` : 'This import'});
  }
  const label = (target: string, fallback = 'Unavailable person') => {
    if (target === 'BOARD') return 'Board';
    const person = people.get(canonical(target));
    if (!person?.name) return fallback;
    const sameName = [...people.values()].filter(p => normaliseFilter(p.name) === normaliseFilter(person.name));
    if (sameName.length < 2) return person.name;
    const choices: (keyof Person)[][] = [['code'], ['designation'], ['designation', 'code'], ['designation', 'code', 'department', 'source']];
    const details = (p: Person, keys: (keyof Person)[]) => keys.map(key => p[key]).filter(Boolean).join(' · ');
    const keys = choices.find(keys => details(person, keys) && sameName.filter(p => details(p, keys) === details(person, keys)).length === 1) ?? choices[3];
    return [person.name, details(person, keys)].filter(Boolean).join(' · ');
  };
  return {canonical, label};
}
type ReportingFeedback = {title: string; before?: string; after?: string; note?: string; otherCount?: number};
function reportingFeedback(previous: OnboardingBatchDetail | undefined, updated: OnboardingBatchDetail,
  recordId: string, moved: boolean): ReportingFeedback | undefined {
  const beforeRecord = previous?.records.find(r => r.id === recordId), afterRecord = updated.records.find(r => r.id === recordId);
  if (!previous || !beforeRecord || !afterRecord) return;
  const identities = reportingIdentities([previous, updated]);
  const before = previous.hierarchy.byRecord[recordId], after = updated.hierarchy.byRecord[recordId];
  const oldTarget = reportingTarget(beforeRecord, before), newTarget = reportingTarget(afterRecord, after);
  const chainKey = (resolution?: ReportingResolution) => JSON.stringify([
    (resolution?.chain ?? []).slice(1).map(p => identities.canonical(p.target)), resolution?.chainEnd ?? '',
  ]);
  const changed = (oldRecord: OnboardingRecord, newRecord: OnboardingRecord) => {
    const a = previous.hierarchy.byRecord[oldRecord.id], b = updated.hierarchy.byRecord[newRecord.id];
    return identities.canonical(reportingTarget(oldRecord, a)) !== identities.canonical(reportingTarget(newRecord, b)) || chainKey(a) !== chainKey(b);
  };
  const oldRecords = new Map(previous.records.map(record => [record.id, record]));
  const otherCount = updated.records.filter(record => record.id !== recordId && oldRecords.has(record.id)
    && changed(oldRecords.get(record.id)!, record)).length;
  let result: ReportingFeedback | undefined;
  if (identities.canonical(oldTarget) !== identities.canonical(newTarget)) {
    result = {title: !oldTarget ? 'Reporting resolved' : !newTarget ? 'Reporting unresolved' : 'Reporting changed',
      before: oldTarget ? identities.label(oldTarget, importedReportingLabel(beforeRecord)) : `Unresolved: ${importedReportingLabel(beforeRecord)}`,
      after: newTarget ? identities.label(newTarget, importedReportingLabel(afterRecord)) : `Unresolved: ${importedReportingLabel(afterRecord)}`};
  } else if (chainKey(before) !== chainKey(after)) {
    const oldChain = (before?.chain ?? []).slice(1), newChain = (after?.chain ?? []).slice(1);
    let changedAt = 0;
    while (changedAt < oldChain.length && changedAt < newChain.length
      && identities.canonical(oldChain[changedAt].target) === identities.canonical(newChain[changedAt].target)) changedAt++;
    const ending = (resolution?: ReportingResolution) => resolution?.chainEnd === 'UNKNOWN' ? 'Not recorded'
      : resolution?.chainEnd === 'LIMIT' ? 'Further levels not shown'
      : resolution?.chainEnd === 'CYCLE' ? 'Circular link' : 'Unresolved';
    const commonPerson = newChain[changedAt - 1] ?? oldChain[changedAt - 1];
    result = {title: 'Wider reporting chain updated', note: oldTarget
      ? `Direct reporting remains ${identities.label(newTarget, importedReportingLabel(afterRecord))}.`
      : 'The direct manager is still unresolved.',
      ...(commonPerson ? {
        before: `${identities.label(commonPerson.target)} → ${oldChain[changedAt] ? identities.label(oldChain[changedAt].target) : ending(before)}`,
        after: `${identities.label(commonPerson.target)} → ${newChain[changedAt] ? identities.label(newChain[changedAt].target) : ending(after)}`,
      } : {})};
  } else if (!newTarget && importedReportingLabel(beforeRecord) !== importedReportingLabel(afterRecord)) {
    result = {title: 'Reporting details saved', note: 'The manager is still unresolved.'};
  } else if (moved || otherCount) result = {title: 'Reporting unchanged'};
  return result ? {...result, otherCount} : undefined;
}

function ReportingChain({ resolution, currentId, onVisit, disabled }: {
  resolution?: ReportingResolution; currentId: string; disabled: boolean;
  onVisit: (targetId: string, fromId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chain = resolution?.chain;
  if (!resolution || !chain?.length) return null;
  const shown = expanded ? chain : chain.slice(0, 3);
  const ending = resolution.error && resolution.target === chain[0]?.target ? 'Self-reporting — choose another manager'
    : resolution.chainEnd === 'CYCLE' ? 'Circular chain'
    : resolution.chainEnd === 'UNRESOLVED' ? 'Reporting link needs correction'
    : resolution.chainEnd === 'UNKNOWN' ? 'Further reporting not recorded'
    : resolution.chainEnd === 'LIMIT' ? 'More levels — open the last manager to continue' : null;
  return <div className="mt-2 text-xs text-slate-600">
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Reporting chain">
      {shown.map((person, index) => <Fragment key={`${person.target}-${index}`}>
        {index > 0 && <span aria-hidden="true">→</span>}
        <span className="inline-flex items-center gap-1" title={[person.name, person.designation, person.employeeCode,
          person.status === 'PENDING' ? 'Not registered' : person.status === 'NEEDS_ATTENTION' ? 'Reporting needs correction' : person.status === 'REGISTERED' ? 'Registered' : ''].filter(Boolean).join(' · ')}>
          {person.recordId && person.recordId !== currentId
            ? <button type="button" disabled={disabled} className="text-blue-700 underline disabled:opacity-50" onClick={event => { event.stopPropagation(); onVisit(person.recordId!, currentId); }}>{person.label}</button>
            : person.employeeId && !person.recordId
              ? <a className="text-blue-700 underline" onClick={event => event.stopPropagation()} href={`/ems/employees/${encodeURIComponent(person.employeeId)}#reporting-manager`} target="_blank" rel="noopener noreferrer" title="Open employee profile in a new tab; this batch stays open">{person.label} ↗</a>
              : <span>{person.label}</span>}
          {index > 0 && person.status === 'PENDING' && <span className="text-amber-700" aria-label="Not registered">•</span>}
          {person.status === 'NEEDS_ATTENTION' && <span className="text-red-600" aria-label="Needs correction">!</span>}
        </span>
      </Fragment>)}
      {chain.length > 3 && <button type="button" className="ml-1 text-blue-700 underline" onClick={event => { event.stopPropagation(); setExpanded(v => !v); }}>{expanded ? 'Less' : `+${chain.length - 3} more`}</button>}
    </div>
    {ending && <p className={resolution.errorScope === 'UPSTREAM' || resolution.chainEnd === 'UNKNOWN' ? 'text-amber-700' : 'text-red-600'}>{ending}</p>}
  </div>;
}

type ScrollSnapshot = { element: HTMLElement | null; top: number; left: number };
function scrollSnapshot(element: HTMLElement | null): ScrollSnapshot {
  let parent = element?.parentElement ?? null;
  while (parent) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
      return { element: parent, top: parent.scrollTop, left: parent.scrollLeft };
    }
    parent = parent.parentElement;
  }
  return { element: null, top: window.scrollY, left: window.scrollX };
}
function restoreScroll(snapshot: ScrollSnapshot) {
  if (snapshot.element) snapshot.element.scrollTo({ top: snapshot.top, left: snapshot.left, behavior: 'instant' });
  else window.scrollTo({ top: snapshot.top, left: snapshot.left, behavior: 'instant' });
}

type SaveNotice = { id?: string; name?: string; action: string; status?: string; summary?: string;
  reporting?: ReportingFeedback; moved: boolean; ready: boolean; showView: boolean; sequence: number };
type ViewportSnapshot = { scroll: ScrollSnapshot; anchor?: string; offset?: number; recordId?: string; keepVisible?: boolean };
type ReturnPoint = { destination: string; name?: string; openId: string | null; openStatus?: OnboardingRecordStatus;
  lastId: string | null; viewport: ViewportSnapshot; filters: RecordFilters; revealedId: string | null };
type ViewportAction = { kind: 'context'; snapshot: ViewportSnapshot; focus?: boolean }
  | { kind: 'reveal'; id: string; editor: boolean };

// Measure top bars at navigation time, so desktop/mobile heights and stacked
// sticky navigation do not need a hard-coded application-shell offset.
function unobscuredTop(snapshot: ScrollSnapshot, edge: number) {
  const content = document.querySelector<HTMLElement>('[data-onboarding-page]')?.getBoundingClientRect();
  const left = Math.max(0, content?.left ?? 0), right = Math.min(window.innerWidth, content?.right ?? window.innerWidth);
  const x = right > left ? (left + right) / 2 : window.innerWidth / 2;
  const landmarks = Array.from(document.querySelectorAll<HTMLElement>('header, nav, [role="banner"], [role="navigation"]'));
  let top = edge;
  // Hit-testing also finds non-semantic top bars. Ancestors catch a header whose
  // positioning belongs to its wrapper. Limit work to landmarks and top-edge hits.
  for (let pass = 0; pass < 3; pass++) {
    const candidates = new Set<HTMLElement>();
    const hits = [1, 16].flatMap(gap => document.elementsFromPoint?.(x, Math.min(top + gap, window.innerHeight - 1)) ?? []);
    for (const node of [...landmarks, ...hits]) {
      for (let element: Element | null = node; element; element = element.parentElement) {
        if (element instanceof HTMLElement) candidates.add(element);
      }
    }
    const previous = top;
    for (const element of candidates) {
      const style = getComputedStyle(element), inset = Number.parseFloat(style.top);
      if (!['fixed', 'sticky'].includes(style.position) || !Number.isFinite(inset)
        || style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const rect = element.getBoundingClientRect();
      // Ignore sidebars, full-height app wrappers, and bars outside this content.
      if (rect.height <= 0 || rect.height > window.innerHeight / 2 || rect.left > x || rect.right < x) continue;
      const origin = style.position === 'sticky' && snapshot.element?.contains(element) ? edge : 0;
      if (rect.top <= Math.max(top, origin + Math.max(0, inset)) + 1 && rect.bottom > top) top = rect.bottom;
    }
    if (top === previous) break;
  }
  return top;
}

function viewportBounds(snapshot: ScrollSnapshot) {
  const host = snapshot.element?.getBoundingClientRect();
  const feedback = document.querySelector<HTMLElement>('[data-onboarding-feedback]')?.getBoundingClientRect();
  const visibleBottom = feedback && feedback.height > 0 ? feedback.top - 16 : window.innerHeight;
  return {
    top: unobscuredTop(snapshot, Math.max(0, host ? host.top + snapshot.element!.clientTop : 0)) + 32,
    bottom: Math.min(visibleBottom, host ? host.top + snapshot.element!.clientTop + snapshot.element!.clientHeight : window.innerHeight) - 32,
  };
}
// Store the visible record/field, not only a pixel offset that becomes stale after reordering.
function captureViewport(root: HTMLElement | null): ViewportSnapshot {
  const scroll = scrollSnapshot(root), bounds = viewportBounds(scroll);
  const anchors = Array.from(root?.querySelectorAll<HTMLElement>('[data-viewport-anchor]') ?? []);
  const visible = anchors.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  const element = visible.find(el => el.getBoundingClientRect().top >= bounds.top) ?? visible[0];
  return { scroll, anchor: element?.dataset.viewportAnchor, recordId: element?.dataset.recordId,
    offset: element ? element.getBoundingClientRect().top - bounds.top : undefined };
}
// A moved editor can remove or relocate most of a screenful of content. Preserve a
// surrounding row, not that editor's old pixel offset or a member of its moved branch.
function captureSurroundingViewport(root: HTMLElement | null, recordId: string,
  previous: OnboardingBatchDetail | undefined, updated: OnboardingBatchDetail): ViewportSnapshot {
  const scroll = scrollSnapshot(root), bounds = viewportBounds(scroll);
  const reports = new Map<string, Set<string>>();
  for (const batch of [previous, updated]) {
    for (const [id, resolution] of Object.entries(batch?.hierarchy.byRecord ?? {})) {
      const manager = resolution.target?.startsWith('record:') ? resolution.target.slice(7) : undefined;
      if (manager) {
        if (!reports.has(manager)) reports.set(manager, new Set());
        reports.get(manager)!.add(id);
      }
    }
  }
  const movingBranch = new Set([recordId]), pending = [recordId];
  for (let i = 0; i < pending.length; i++) {
    for (const report of reports.get(pending[i]) ?? []) {
      if (!movingBranch.has(report)) { movingBranch.add(report); pending.push(report); }
    }
  }
  const remaining = new Set(updated.records.map(record => record.id));
  const anchors = Array.from(root?.querySelectorAll<HTMLElement>('[data-viewport-anchor]') ?? [])
    .filter(el => !el.dataset.recordId || (!movingBranch.has(el.dataset.recordId) && remaining.has(el.dataset.recordId)));
  const visible = anchors.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  let element: HTMLElement | undefined = visible.find(el => el.getBoundingClientRect().top >= bounds.top) ?? visible[0];
  let offset = element ? element.getBoundingClientRect().top - bounds.top : 0;
  if (!element) {
    // When only the disappearing/moving editor is visible, use its nearest
    // surrounding row at the top of the viewport instead of jumping to the list's end.
    const rows = anchors.filter(el => el.dataset.viewportAnchor?.startsWith('row:'));
    const distance = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return Math.max(bounds.top - rect.bottom, rect.top - bounds.bottom, 0);
    };
    element = rows.reduce<HTMLElement | undefined>((nearest, el) => !nearest || distance(el) < distance(nearest) ? el : nearest, undefined)
      ?? anchors.find(el => el.dataset.viewportAnchor === 'batch-heading');
    offset = 0;
  }
  return { scroll, anchor: element?.dataset.viewportAnchor, recordId: element?.dataset.recordId, offset, keepVisible: true };
}
function restoreViewport(root: HTMLElement | null, snapshot: ViewportSnapshot, focus = false) {
  const anchor = Array.from(root?.querySelectorAll<HTMLElement>('[data-viewport-anchor]') ?? [])
    .find(el => el.dataset.viewportAnchor === snapshot.anchor);
  if (anchor && snapshot.offset !== undefined) {
    const scroll = scrollSnapshot(anchor), bounds = viewportBounds(scroll);
    const rect = anchor.getBoundingClientRect();
    const offset = snapshot.keepVisible ? Math.max(0, Math.min(snapshot.offset, bounds.bottom - bounds.top - rect.height)) : snapshot.offset;
    restoreScroll({ ...scroll, top: scroll.top + rect.top - bounds.top - offset });
    if (focus) (anchor.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') ?? anchor).focus({preventScroll: true});
    return;
  }
  restoreScroll(snapshot.scroll);
  // The editor may have closed after validation; use its record header as the fallback.
  if (snapshot.recordId) {
    const row = Array.from(root?.querySelectorAll<HTMLTableRowElement>('tr[data-viewport-anchor]') ?? [])
      .find(el => el.dataset.recordId === snapshot.recordId);
    revealSavedRow(row);
  }
}

// Reveal the entire collapsed row with breathing room, without moving an already visible row.
function revealSavedRow(element: HTMLTableRowElement | undefined, editor = false) {
  if (!element) return;
  const snapshot = scrollSnapshot(element);
  const rect = element.getBoundingClientRect();
  const {top, bottom} = viewportBounds(snapshot);
  const available = Math.max(0, bottom - top);
  if (editor || rect.top < top || rect.bottom > bottom) {
    const desiredTop = editor || rect.height > available ? top : top + (available - rect.height) / 2;
    restoreScroll({ ...snapshot, top: snapshot.top + rect.top - desiredTop });
  }
  element.focus({preventScroll: true});
}

function revealEditorField(root: HTMLElement | null, key: string) {
  const field = Array.from(root?.querySelectorAll<HTMLElement>('[data-editor-field]') ?? []).find(el => el.dataset.editorField === key);
  if (!field) return;
  const scroll = scrollSnapshot(field), bounds = viewportBounds(scroll);
  const toolbar = root?.querySelector<HTMLElement>('[data-editor-toolbar]')?.getBoundingClientRect();
  const bottom = toolbar && toolbar.top > bounds.top && toolbar.top < bounds.bottom ? toolbar.top - 16 : bounds.bottom;
  const rect = field.getBoundingClientRect();
  const desired = bounds.top + Math.max(0, Math.min(48, (bottom - bounds.top - rect.height) / 2));
  restoreScroll({...scroll, top: scroll.top + rect.top - desired});
  (field.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)') ?? field).focus({preventScroll: true});
}

const FEEDBACK_LINK = 'rounded px-1 font-medium underline underline-offset-2 text-purple-800 hover:text-purple-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700 disabled:opacity-50';

function SaveFeedback({ notice, hasReturn, disabled, onView, onDismiss }: {
  notice: SaveNotice; hasReturn: boolean; disabled: boolean; onView: () => void; onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(7000);
  const automatic = notice.ready && !notice.showView && !hasReturn;
  useEffect(() => {
    if (!automatic || hovered || focused) return;
    const started = Date.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [automatic, hovered, focused, onDismiss]);
  return <div className="p-3 text-sm text-slate-700" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {notice.summary && <p>{notice.summary}</p>}
    {notice.id && <p>{notice.name} · {notice.action}{notice.status ? ` · ${notice.status}` : ''}{notice.moved ? ' · Position changed' : ''}</p>}
    {notice.reporting && <div className="mt-2 space-y-1 break-words text-xs" data-reporting-feedback>
      <p className="font-semibold">{notice.reporting.title}</p>
      {notice.reporting.before && <p>From: {notice.reporting.before}<br />To: {notice.reporting.after}</p>}
      {notice.reporting.note && <p>{notice.reporting.note}</p>}
      {!!notice.reporting.otherCount && <p>{notice.reporting.otherCount} other {notice.reporting.otherCount === 1 ? 'record has an updated reporting chain' : 'records have updated reporting chains'}.</p>}
    </div>}
    {notice.id && notice.showView && <button type="button" disabled={disabled} onClick={onView} className={`mr-3 ${FEEDBACK_LINK}`}>View {notice.name}</button>}
    <button type="button" onClick={onDismiss} className="text-slate-500 underline" aria-label="Dismiss save notification">Dismiss</button>
  </div>;
}

function RecordEditor({
  record, batch, required, onSave, onSaved, onSaveHod, onHodSaved, onConfirmDuplicate, onUndoDuplicate, reviewReturnTo, onVisit, onRefreshDuplicates, onExclude, onInclude, saving, exclusionError, inclusionError, reportingOptions, reportingResolution, reportingSuggestions = [], onDirtyChange, reviewSequence = 0,
}: {
  record: OnboardingRecord;
  batch: OnboardingBatchDetail;
  reportingOptions: ReportingOption[];
  reportingSuggestions?: ReportingOption[];
  onDirtyChange: (dirty: boolean) => void;
  reviewSequence?: number;
  reportingResolution?: ReportingResolution;
  onSave: (data: UpdateOnboardingRecordPayload) => Promise<OnboardingBatchDetail>;
  onSaved: (updated: OnboardingBatchDetail) => void;
  onSaveHod: (target: string, expectedVersion: string) => Promise<OnboardingBatchDetail>;
  onHodSaved: (updated: OnboardingBatchDetail) => void;
  onConfirmDuplicate: (token: string) => Promise<void>;
  onUndoDuplicate: (token: string) => Promise<void>;
  reviewReturnTo: string | null;
  onVisit: (id: string) => void;
  onRefreshDuplicates: () => void;
  onExclude: (reason: string) => void;
  onInclude: () => void;
  saving: boolean;
  exclusionError?: string;
  inclusionError?: string;
  required: Set<keyof UpdateOnboardingRecordPayload>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [highlightReview, setHighlightReview] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(0);
  function makeDraft(source: OnboardingRecord, options: ReportingOption[], resolution?: ReportingResolution, people = batch.peopleLinks?.byRecord[source.id]): UpdateOnboardingRecordPayload {
    const initial: UpdateOnboardingRecordPayload = {};
    for (const { key } of EDITABLE_FIELDS) {
      initial[key] = (source[key as keyof OnboardingRecord] as string | null) ?? "";
    }
    for (const slot of [1, 2] as const) {
      const employeeId = source[`reliever${slot}EmployeeId`], recordId = source[`reliever${slot}RecordId`];
      initial[`reliever${slot}Target`] = employeeId || recordId
        ? (slot === 1 ? people?.first.target : people?.second.target) ?? (employeeId ? `employee:${employeeId}` : `record:${recordId}`) : '';
    }
    initial.reportingTarget = reportingTarget(source, resolution);
    const selected = options.find(o => o.target === initial.reportingTarget);
    if (initial.reportingTarget === 'BOARD') {
      initial.reportingToName = '';
      initial.reportingToDesignation = 'Board';
    } else if (selected) {
      initial.reportingToName = selected.name;
      initial.reportingToDesignation = selected.designation;
    }
    return initial;
  }
  const [baseline, setBaseline] = useState(() => makeDraft(record, reportingOptions, reportingResolution));
  const [draft, setDraft] = useState<UpdateOnboardingRecordPayload>(() => baseline);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hodDirty, setHodDirty] = useState(false);
  const dirty = Object.keys(draft).some(key => draft[key as keyof UpdateOnboardingRecordPayload] !== baseline[key as keyof UpdateOnboardingRecordPayload]);
  useEffect(() => { onDirtyChange(dirty || hodDirty); }, [dirty, hodDirty, onDirtyChange]);
  // A background refresh may update saved findings; never overwrite an unsaved draft.
  useEffect(() => {
    if (dirty) return;
    const next = makeDraft(record, reportingOptions, reportingResolution);
    setBaseline(next); setDraft(next);
  }, [record, reportingOptions, reportingResolution]);
  function choosePerson(target: string) {
    setHighlightReview(false);
    const person = reportingOptions.find(o => o.target === target);
    setFeedback(null);
    setDraft(d => ({ ...d, reportingTarget: target,
      reportingToName: target === 'BOARD' ? '' : person?.name ?? d.reportingToName,
      reportingToDesignation: target === 'BOARD' ? 'Board' : person?.designation ?? d.reportingToDesignation,
    }));
  }
  async function saveDraft() {
    if (hodDirty) { setFeedback('Save or discard the department HOD change first.'); return; }
    setFeedback(null);
    try {
      const updated = await onSave({ ...draft });
      const saved = updated.records.find(r => r.id === record.id);
      if (!saved) throw new Error('Saved record was not returned. Refresh before continuing.');
      const next = makeDraft(saved, updated.hierarchy.options, updated.hierarchy.byRecord[saved.id], updated.peopleLinks?.byRecord[saved.id]);
      setBaseline(next); setDraft(next); onDirtyChange(false);
      // The action notice already confirms success; adding another banner here shifts the fields after scrolling was restored.
      setFeedback(null);
      // Commit the new batch and viewport together with the clean draft, after both unsaved banners disappear.
      onSaved(updated);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save. Your edits are still here.');
    }
  }
  const [reason, setReason] = useState("");

  const currentReporting = makeDraft(record, reportingOptions, reportingResolution);
  const findings = editorFindings(record, draft, required, currentReporting, reportingResolution);
  const issueOrder = ['reportingTarget', ...EDITABLE_FIELDS.map(field => field.key),
    ...[...findings.keys()].filter(key => key !== 'reportingTarget' && !EDITABLE_FIELDS.some(field => field.key === key))];
  const currentIssues = issueOrder.flatMap(key => (findings.get(key) ?? [])
    .filter(finding => !finding.stale).map(finding => ({key, message: finding.message})));
  const staleCount = [...findings.values()].flat().filter(finding => finding.stale).length;
  const hasReview = currentIssues.length > 0 || staleCount > 0;
  // Each completed action can draw attention once; editing never restarts the highlight.
  useEffect(() => {
    setHighlightReview(!!reviewSequence && record.status === 'NEEDS_FIXING' && currentIssues.length > 0);
    const timer = window.setTimeout(() => setHighlightReview(false), 6000);
    return () => window.clearTimeout(timer);
  }, [reviewSequence]);
  function reviewIssues() {
    setHighlightReview(false);
    setReviewRequest(request => request + 1);
  }
  useLayoutEffect(() => {
    if (!reviewRequest || !summaryRef.current) return;
    // Reveal after the summary is mounted, including when Review is clicked again.
    const row = editorRef.current?.closest('tr')?.previousElementSibling;
    if (row instanceof HTMLTableRowElement) revealSavedRow(row, true);
    summaryRef.current.focus({preventScroll: true});
  }, [reviewRequest]);
  const issueLabel = (key: string) => key === 'reportingTarget' ? 'Reporting person or Board'
    : key === 'duplicateReview' ? 'Duplicate-person review' : EDITABLE_FIELDS.find(field => field.key === key)?.label ?? (key === 'registration' ? 'Registration' : 'Record');
  const fieldMessages = (key: string) => findings.get(key)?.length ? <ul id={`issues-${record.id}-${key}`} className="mt-1 space-y-1 text-xs" data-field-findings={key}>
    {findings.get(key)!.map((finding, index) => <li key={index} className={finding.stale ? 'text-slate-500' : 'text-red-700'}>{finding.stale && 'Last saved check: '}{finding.message}</li>)}
  </ul> : null;
  const locked = record.status === "REGISTERED";
  const selectablePeople = reportingOptions.filter(o => o.target !== `record:${record.id}` && o.target !== `employee:${record.employeeId}`);
  const invalidSelection = !!draft.reportingTarget && draft.reportingTarget !== 'BOARD' && !selectablePeople.some(o => o.target === draft.reportingTarget);
  const selfSelected = draft.reportingTarget === `record:${record.id}` || (!!record.employeeId && draft.reportingTarget === `employee:${record.employeeId}`);
  const peopleLinks = batch.peopleLinks?.byRecord[record.id];
  const peopleOptions = batch.peopleLinks?.options ?? reportingOptions;
  const relieverOptions = peopleOptions.filter(p => p.target !== `record:${record.id}` && p.target !== `employee:${record.employeeId}`);
  function chooseReliever(slot: 1 | 2, target: string) {
    const person = peopleOptions.find(p => p.target === target);
    setDraft(d => ({...d, [`reliever${slot}Target`]: target,
      ...(target === 'NONE' ? {[`reliever${slot}Name`]: '', [`reliever${slot}Designation`]: ''}
        : person ? {[`reliever${slot}Name`]: person.name, [`reliever${slot}Designation`]: person.designation} : {})}));
    setFeedback(null);
  }
  const identities = reportingIdentities([batch]);
  const reportingEdited = identities.canonical(draft.reportingTarget ?? '') !== identities.canonical(currentReporting.reportingTarget ?? '')
    || (!draft.reportingTarget && (reportingText(draft.reportingToName) !== reportingText(currentReporting.reportingToName)
      || reportingText(draft.reportingToDesignation) !== reportingText(currentReporting.reportingToDesignation)));
  const currentReportingLabel = currentReporting.reportingTarget
    ? identities.label(currentReporting.reportingTarget, importedReportingLabel(record)) : `Unresolved: ${importedReportingLabel(record)}`;
  const proposedReportingLabel = draft.reportingTarget
    ? identities.label(draft.reportingTarget, importedReportingLabel(draft)) : `Resolve on save: ${importedReportingLabel(draft)}`;

  return (
    <div ref={editorRef} className="max-sm:max-w-[calc(100vw-3rem)] bg-blue-50/40 border-b-2 border-slate-300 px-3 sm:px-5 py-4 space-y-4">
      {hodDirty && <p role="status" className="rounded-lg border border-purple-300 bg-purple-50 p-3 text-sm text-purple-900">Save or discard the department HOD change before editing this record.</p>}
      {dirty && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Unsaved changes. Record status and saved validation findings describe the last saved version. Choose Save &amp; re-validate to check these edits.</p>}
      {feedback && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{feedback}</p>}
      {hasReview && reviewRequest > 0 && <div ref={summaryRef} id={`review-summary-${record.id}`} data-review-summary tabIndex={-1} aria-labelledby={`review-title-${record.id}`}
        className="rounded-lg border border-red-200 bg-white p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-600">
        <h3 id={`review-title-${record.id}`} className="font-semibold text-slate-800">
          {currentIssues.length ? `${currentIssues.length} ${currentIssues.length === 1 ? 'issue' : 'issues'} to review` : 'Edits awaiting validation'}
        </h3>
        {!!currentIssues.length && <>
          <p className="mt-1 text-xs text-slate-600">Select an issue to go to its field.</p>
          <ul className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {currentIssues.map((issue, index) => <li key={`${issue.key}:${index}`} className="min-w-0 text-xs text-red-700 break-words">
              {issue.key === 'reportingTarget' || issue.key === 'duplicateReview' || EDITABLE_FIELDS.some(field => field.key === issue.key)
                ? <button type="button" disabled={saving} className="text-left font-semibold underline underline-offset-2 hover:text-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 disabled:opacity-50"
                    onClick={() => { setHighlightReview(false); revealEditorField(editorRef.current, issue.key); }}>
                    {issueLabel(issue.key)}: {issue.message}
                  </button>
                : <span><strong>{issueLabel(issue.key)}:</strong> {issue.message}</span>}
            </li>)}
          </ul>
        </>}
        {!!staleCount && <p className="mt-2 text-xs text-slate-600">Edited fields still need validation. Save &amp; re-validate to refresh their findings.</p>}
      </div>}
      {record.status !== 'REGISTERED' && record.status !== 'EXCLUDED' && <OnboardingDuplicateReview
        review={record.duplicateReview} batchId={batch.id} recordId={record.id} returnTo={reviewReturnTo} dirty={dirty || hodDirty} disabled={saving}
        onConfirm={onConfirmDuplicate} onUndo={onUndoDuplicate} onVisit={onVisit} onRefresh={onRefreshDuplicates} />}
      <div className="space-y-2" data-viewport-anchor={`manager:${record.id}`} data-record-id={record.id} data-editor-field="reportingTarget" tabIndex={-1}>
        <label className="block text-xs font-semibold text-slate-600" htmlFor={`manager-${record.id}`}>
          Reporting person or Board <span className="text-red-500">*</span>
        </label>
        <select
          id={`manager-${record.id}`}
          disabled={locked || saving || hodDirty}
          value={draft.reportingTarget ?? ''}
          aria-invalid={findings.get('reportingTarget')?.some(finding => !finding.stale) || undefined}
          aria-describedby={findings.has('reportingTarget') ? `issues-${record.id}-reportingTarget` : undefined}
          onChange={e => choosePerson(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
        >
          <option value="">Resolve from imported name and designation</option>
          <option value="BOARD">Board — most senior person</option>
          {invalidSelection && (
            <option value={draft.reportingTarget!} disabled>{selfSelected ? `${[record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ')} — invalid: self-reporting` : 'Previously selected person — unavailable; choose again'}</option>
          )}
          {selectablePeople.slice().sort((a, b) => {
            const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
            const title = key(draft.reportingToDesignation ?? '');
            return Number(key(b.designation) === title) - Number(key(a.designation) === title) || a.name.localeCompare(b.name);
          }).map(o => <option key={o.target} value={o.target}>
            {[o.name, o.designation, o.department, o.branch, o.employeeCode, o.target.startsWith('record:') ? 'This import' : 'Existing employee'].filter(Boolean).join(' · ')}
          </option>)}
        </select>
        {fieldMessages('reportingTarget')}
        <p className="text-xs text-slate-500">Matching designations appear first. Choose the person to fill their name and designation. Board is for the most senior person.</p>
        {!locked && reportingEdited && <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-slate-700 space-y-1 break-words"
          role="status" aria-live="polite" data-reporting-preview>
          <p className="font-semibold text-amber-800">Reporting change · Unsaved</p>
          <p>Current: {currentReportingLabel}</p>
          <p>Proposed: {proposedReportingLabel}</p>
          <p className="text-slate-500">The reporting relationship will be checked when you save.</p>
        </div>}
        {!locked && !dirty && !draft.reportingTarget && reportingSuggestions.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-3">
            <p className="text-sm font-semibold text-slate-800">{reportingSuggestions.length === 1 ? 'Suggested manager — please confirm' : 'Possible managers — choose the correct person'}</p>
            <p className="text-xs text-slate-600">The first and last names and designation match. The imported name omits a middle name. Confirm the person, then save to validate their reporting chain.</p>
            {reportingSuggestions.map(person => <div key={person.target} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <p className="text-sm text-slate-700">{[person.name, person.designation, person.department, person.branch, person.employeeCode, person.target.startsWith('record:') ? 'This import' : 'Existing employee'].filter(Boolean).join(' · ')}</p>
              <button type="button" disabled={saving} onClick={() => choosePerson(person.target)} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">Use this person</button>
            </div>)}
          </div>
        )}
        {reportingResolution?.errorScope === 'UPSTREAM' && reportingResolution.error && <p className="text-xs text-amber-700">{dirty && 'Last saved check: '}{reportingResolution.error}</p>}
        {!reportingResolution?.error && reportingResolution?.warning && <details className="text-xs text-amber-700"><summary className="cursor-pointer">{dirty && 'Last saved check: '}Reporting details</summary><p>{reportingResolution.warning}</p></details>}
        {locked && record.employeeId && <Link className="inline-block text-sm text-blue-600 underline" href={`/ems/employees/${record.employeeId}#reporting-manager`}>View or correct reporting assignment on employee profile</Link>}
      </div>
      {peopleLinks && <>
        <DepartmentHodEditor recordId={record.id} hod={peopleLinks.hod} options={peopleOptions}
          importedName={record.hodName} importedDesignation={record.hodDesignation}
          disabled={locked || record.status === 'EXCLUDED' || saving} recordDirty={dirty}
          onDirtyChange={setHodDirty} onSave={onSaveHod} onSaved={updated => {setHodDirty(false); onHodSaved(updated);}} />
        <div className="grid gap-4 sm:grid-cols-2">
          {([1, 2] as const).map(slot => <div key={slot} data-editor-field={`reliever${slot}Name`} tabIndex={-1} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <PersonLinkPicker id={`reliever-${slot}-${record.id}`} label={slot === 1 ? 'First reliever' : 'Second reliever'}
              value={draft[`reliever${slot}Target`] ?? ''} options={relieverOptions} allowImported
              disabled={locked || saving || hodDirty} onChange={target => chooseReliever(slot, target)} />
            {fieldMessages(`reliever${slot}Name`)}
            <p className="text-xs text-slate-500">Saved link</p>
            <PersonLinkStatus link={slot === 1 ? peopleLinks.first : peopleLinks.second} showError={false} />
          </div>)}
        </div>
      </>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {EDITABLE_FIELDS.filter(field => !peopleLinks || !["hodName", "hodDesignation"].includes(field.key)).map(({ key, label }) => {
          const choices = EDITOR_CHOICES[key];
          const selected = choices ? editorChoice(key, draft[key]) : '';
          const reporting = key === 'reportingToName' || key === 'reportingToDesignation';
          const requiredHere = required.has(key) && !(reporting && draft.reportingTarget)
            && !(key === 'reportingToName' && ['board', 'boardofdirectors'].includes(editorValueKey(draft.reportingToDesignation)));
          const props = {
            id: `field-${record.id}-${key}`,
            disabled: locked || saving || hodDirty || (!!draft.reportingTarget && reporting) || (/^reliever[12](Name|Designation)$/.test(key) && !!draft[`reliever${key.includes("1") ? 1 : 2}Target`]),
            'aria-required': requiredHere || undefined,
            'aria-invalid': findings.get(key)?.some(finding => !finding.stale) || undefined,
            'aria-describedby': [findings.has(key) ? `issues-${record.id}-${key}` : '', key === 'companyCode' ? `help-${record.id}-${key}` : ''].filter(Boolean).join(' ') || undefined,
            className: `mt-1 w-full min-w-0 px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${findings.get(key)?.some(finding => !finding.stale) ? 'border-red-300' : 'border-slate-200'}`,
            onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setHighlightReview(false); setFeedback(null); setDraft(d => ({...d, [key]: event.target.value})); },
          };
          return <div key={key} className="min-w-0" data-viewport-anchor={`field:${record.id}:${key}`} data-record-id={record.id} data-editor-field={key} tabIndex={-1}>
            <label htmlFor={props.id} className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </label>
            {requiredHere && <span aria-hidden="true" className="text-[11px] font-semibold text-red-500"> *</span>}
            {choices ? <select {...props} value={selected}>
              <option value="">{key === 'beesAccessLevel' ? 'Choose access level' : key === 'employmentStatus' ? 'Not provided — registers as Active' : 'Not provided'}</option>
              {selected === '__imported__' && <option value="__imported__" disabled>Imported: {draft[key]} — not recognised</option>}
              {Object.entries(choices).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              {key !== 'beesAccessLevel' && <option value="N/A">{key === 'employmentStatus' ? 'N/A — registers as Active' : 'Not applicable (N/A)'}</option>}
            </select> : <input {...props} type="text" value={draft[key] ?? ''} />}
            {!(peopleLinks && /^reliever[12]Name$/.test(key)) && fieldMessages(key)}
            {key === "companyCode" && (
              <p id={`help-${record.id}-${key}`} className="mt-1 text-xs font-normal normal-case tracking-normal text-slate-500">
                Optional. Enter the company code used in your existing records, if applicable.
              </p>
            )}
          </div>;
        })}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
          {record.status === "EXCLUDED" ? (
            <div>
            <button
              onClick={onInclude}
              disabled={saving || dirty || hodDirty}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Put back in
            </button>
            {inclusionError && <p role="alert" className="mt-1 text-xs text-red-600">{inclusionError}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 ml-auto max-w-full">
              <div className="w-56 max-w-full">
                <input
                  type="text"
                  disabled={saving}
                  aria-label="Reason for excluding"
                  aria-invalid={!!exclusionError}
                  aria-describedby={
                    exclusionError ? `exclude-error-${record.id}` : undefined
                  }
                  placeholder="Reason for excluding…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    exclusionError ? "border-red-300" : "border-slate-200"
                  }`}
                />
                {exclusionError && (
                  <p
                    id={`exclude-error-${record.id}`}
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {exclusionError}
                  </p>
                )}
              </div>
              <button
                onClick={() => onExclude(reason)}
                disabled={saving || dirty || hodDirty}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" /> Exclude
              </button>
            </div>
          )}
        </div>
      )}
      {!locked && <div data-editor-toolbar data-viewport-anchor={`actions:${record.id}`} data-record-id={record.id}
        className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 shadow-md">
        <span className="min-w-0 flex-1 basis-full sm:basis-auto text-xs font-medium text-slate-600 break-words">Editing {[draft.firstName, draft.lastName].filter(Boolean).join(' ') || 'record'}{draft.employeeCode ? ` · ${draft.employeeCode}` : ''}</span>
        <button type="button" disabled={saving || !hasReview} onClick={reviewIssues}
          aria-expanded={hasReview && reviewRequest > 0} aria-controls={hasReview && reviewRequest > 0 ? `review-summary-${record.id}` : undefined}
          data-review-highlighted={highlightReview || undefined}
          className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 disabled:opacity-40 ${highlightReview
            ? 'border-purple-700 bg-purple-50 text-purple-900 shadow-[0_0_0_3px_rgba(126,34,206,0.18)]'
            : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
          Review issues
        </button>
        <button type="button" onClick={() => void saveDraft()} disabled={saving || hodDirty}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Save &amp; re-validate
        </button>
      </div>}
    </div>
  );
}

export default function EmsOnboardingBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [lastRow, setLastRow] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const onDirtyChange = useCallback((dirty: boolean) => setEditorDirty(dirty), []);
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_FILTERS);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [viewportAction, setViewportAction] = useState<ViewportAction | null>(null);
  const [returnPoints, setReturnPoints] = useState<ReturnPoint[]>([]);
  const [externalReturn, setExternalReturn] = useState<string | null>(null);
  const focusedReviewLink = useRef<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [actionError, setActionError] = useState<{kind: string; message: string; recordId?: string} | null>(null);
  const noticeSequence = useRef(0);
  const saveBaseline = useRef<OnboardingBatchDetail | undefined>(undefined);
  const dismissNotice = useCallback(() => setSaveNotice(null), []);
  const mayLeaveEditor = () => !editorDirty || window.confirm('Discard the unsaved changes in the open record?');
  const returnPoint = (destination: string, name?: string): ReturnPoint => ({
    destination, name, openId: openRow, openStatus: batch?.records.find(r => r.id === openRow)?.status,
    lastId: lastRow, viewport: captureViewport(pageRef.current), filters: {...filters}, revealedId,
  });
  const toggleRow = (recordId: string) => {
    if (busy || !mayLeaveEditor()) return;
    const nextOpen = openRow === recordId ? null : recordId;
    setEditorDirty(false); setOpenRow(nextOpen); setLastRow(recordId); setRevealedId(recordId);
    setViewportAction({kind: 'reveal', id: recordId, editor: !!nextOpen});
  };
  const visitRow = (targetId: string, fromId?: string) => {
    if (busy || !batch?.records.some(r => r.id === targetId) || !mayLeaveEditor()) return;
    if (fromId && fromId !== targetId) {
      const record = batch?.records.find(r => r.id === fromId);
      const point = returnPoint(`manager:${targetId}`, batch?.hierarchy.byRecord[fromId]?.chain?.[0]?.label || [record?.firstName, record?.middleName, record?.lastName].filter(Boolean).join(' ') || 'record');
      setReturnPoints(points => [...points, point]);
    }
    setEditorDirty(false); setOpenRow(targetId); setLastRow(targetId); setRevealedId(targetId);
    setViewportAction({kind: 'reveal', id: targetId, editor: true});
  };
  const viewSavedRow = () => {
    const record = batch?.records.find(r => r.id === saveNotice?.id);
    if (busy || !saveNotice || !record || !mayLeaveEditor()) return;
    // Read the current status: a later validation may have changed the original notice's result.
    const nextOpen = record.status === 'NEEDS_FIXING' || record.status === 'DRAFT' ? record.id : null;
    const point = returnPoint(`notice:${saveNotice.sequence}`);
    if (returnPoints[returnPoints.length - 1]?.destination !== point.destination || openRow !== nextOpen || lastRow !== record.id) {
      setReturnPoints(points => [...points, point]);
    }
    setEditorDirty(false); setOpenRow(nextOpen); setLastRow(record.id); setRevealedId(record.id);
    setViewportAction({kind: 'reveal', id: record.id, editor: !!nextOpen});
  };
  const returnToRecord = () => {
    const point = returnPoints[returnPoints.length - 1];
    if (busy || !point || !mayLeaveEditor()) return;
    const record = batch?.records.find(r => r.id === point.openId);
    const becameClosed = record && record.status !== point.openStatus && ['READY', 'EXCLUDED', 'REGISTERED'].includes(record.status);
    setEditorDirty(false);
    setOpenRow(record && !becameClosed ? record.id : null);
    setLastRow(point.lastId);
    const origin = point.viewport.recordId;
    const returnMatches = matchingRecordIds(batch, point.filters);
    setFilters(point.filters); setRevealedId(origin && !returnMatches.has(origin) ? origin : point.revealedId);
    setReturnPoints(points => points.slice(0, -1));
    setViewportAction({kind: 'context', snapshot: point.viewport, focus: true});
  };

  const [countryDraft, setCountryDraft] = useState<string | null>(null);

  const queryKey = ["ems-onboarding-batch", id];

  const { data: batch, isLoading: loading, error: queryError } = useQuery({
    queryKey,
    queryFn: () => EmsService.getOnboardingBatch(id, accessToken!),
    enabled: !!accessToken,
  });

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setExternalReturn(safeReviewReturn(search.get('returnTo')));
    if (!batch || batch.id !== id) return;
    const target = search.get('record');
    const key = `${id}:${target ?? ''}`;
    if (!target || focusedReviewLink.current === key) return;
    focusedReviewLink.current = key;
    const record = batch.records.find(r => r.id === target);
    if (!record) {
      setActionError({kind: 'review-link', message: 'The linked record is not available in this import.'});
      return;
    }
    const open = !['REGISTERED', 'EXCLUDED'].includes(record.status);
    setEditorDirty(false); setOpenRow(open ? record.id : null); setLastRow(record.id); setRevealedId(record.id);
    setViewportAction({kind: 'reveal', id: record.id, editor: open});
  }, [id, batch]);

  const { data: channelData, isPending: channelLoading, error: channelError, isFetching: channelFetching, refetch: refetchChannel } = useQuery({
    queryKey: ["ems-communication-channel"],
    queryFn: () => EmsService.getCommunicationChannel(accessToken!),
    enabled: !!accessToken,
  });
  const filterModel = useMemo(() => reportingFilterModel(batch), [batch]);
  const matchingIds = useMemo(() => matchingRecordIds(batch, filters, filterModel), [batch, filters, filterModel]);
  const filterActive = hasFilters(filters);
  const changeFilters = (next: RecordFilters) => {
    if (busy) return;
    // Preserve the open draft. If it falls outside the filters, show it explicitly as an extra row.
    setFilters(next); setRevealedId(null);
  };
  const hideExtraRecords = () => {
    if (busy) return;
    if (openRow && !matchingIds.has(openRow)) {
      if (!mayLeaveEditor()) return;
      setEditorDirty(false); setOpenRow(null);
    }
    setRevealedId(null);
    setViewportAction({kind: 'context', snapshot: {scroll: scrollSnapshot(pageRef.current), anchor: 'batch-filters', offset: 0}});
  };
  useLayoutEffect(() => {
    const root = pageRef.current;
    const toolbar = root?.querySelector<HTMLElement>('[data-editor-toolbar]');
    const update = () => {
      const rect = toolbar?.getBoundingClientRect();
      const visible = rect && rect.top < window.innerHeight && rect.bottom > window.innerHeight / 2;
      root?.style.setProperty('--ems-feedback-bottom', `${visible ? Math.max(16, window.innerHeight - rect.top + 12) : 16}px`);
    };
    update();
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    if (toolbar) observer?.observe(toolbar);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); observer?.disconnect(); };
  }, [openRow, batch, saveNotice, filters, revealedId]);
  useLayoutEffect(() => {
    if (!viewportAction) return;
    if (viewportAction.kind === 'context') restoreViewport(pageRef.current, viewportAction.snapshot, viewportAction.focus);
    else revealSavedRow(rowRefs.current.get(viewportAction.id), viewportAction.editor);
    setViewportAction(null);
  }, [viewportAction, batch, openRow, filters, revealedId]);

  const required = requiredFields(channelData?.communicationChannel ?? null);
  const beginAction = () => { setActionError(null); setSaveNotice(null); };
  const failedAction = (kind: string, error: Error, recordId?: string) => setActionError({kind, recordId, message: error.message || 'Could not complete this action. Please try again.'});
  const recordName = (updated: OnboardingBatchDetail, record: OnboardingRecord) =>
    updated.hierarchy.byRecord[record.id]?.chain?.[0]?.label || [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ');
  const positionChanged = (updated: OnboardingBatchDetail, recordId: string) => {
    const previous = queryClient.getQueryData<OnboardingBatchDetail>(queryKey);
    const before = previous?.records.findIndex(r => r.id === recordId) ?? -1;
    const after = updated.records.findIndex(r => r.id === recordId);
    return before >= 0 && after >= 0 && before !== after;
  };
  const statusText = (record: OnboardingRecord, updated: OnboardingBatchDetail, still = false) =>
    needsDuplicateReview(record, updated.hierarchy.byRecord[record.id]) ? 'Needs review'
      : waitingOnChain(record, updated.hierarchy.byRecord[record.id]) ? 'Waiting on reporting chain'
      : record.status === 'NEEDS_FIXING' && still ? 'Still needs fixing' : RECORD_STATUS_LABELS[record.status];
  const finishRecordAction = (updated: OnboardingBatchDetail, recordId: string, action: 'Saved' | 'Reviewed' | 'Confirmation undone' | 'Excluded' | 'Put back') => {
    const record = updated.records.find(r => r.id === recordId);
    const moved = positionChanged(updated, recordId);
    const updatedMatches = matchingRecordIds(updated, filters);
    const outsideFilters = !!record && !updatedMatches.has(recordId);
    const beforeVisible = (batch?.records ?? []).filter(r => matchingIds.has(r.id) || r.id === openRow || r.id === revealedId);
    const afterVisible = updated.records.filter(r => updatedMatches.has(r.id) || r.id === recordId);
    const visibleMoved = moved && beforeVisible.findIndex(r => r.id === recordId) !== afterVisible.findIndex(r => r.id === recordId);
    const snapshot = visibleMoved
      ? captureSurroundingViewport(pageRef.current, recordId, queryClient.getQueryData<OnboardingBatchDetail>(queryKey), updated)
      : captureViewport(pageRef.current);
    const closes = record && ['READY', 'EXCLUDED', 'REGISTERED'].includes(record.status);
    setEditorDirty(false);
    setRevealedId(recordId);
    if (closes) { setOpenRow(null); setLastRow(recordId); }
    setViewportAction(visibleMoved ? {kind: 'context', snapshot}
      : closes ? {kind: 'reveal', id: recordId, editor: false} : {kind: 'context', snapshot});
    setSaveNotice(record ? {id: recordId, name: recordName(updated, record), action,
      status: action === 'Excluded' ? undefined : statusText(record, updated, action === 'Saved' && !moved),
      reporting: action === 'Saved' ? reportingFeedback(saveBaseline.current, updated, recordId, moved) : undefined,
      moved, ready: record.status === 'READY', showView: moved || outsideFilters, sequence: ++noticeSequence.current} : null);
    queryClient.setQueryData(queryKey, updated);
  };
  const finishBatchAction = (updated: OnboardingBatchDetail, action: string) => {
    const snapshot = captureViewport(pageRef.current);
    const record = updated.records.find(r => r.id === openRow);
    const moved = record ? positionChanged(updated, record.id) : false;
    if (record) setRevealedId(record.id);
    if (record && ['READY', 'EXCLUDED', 'REGISTERED'].includes(record.status)) {
      setEditorDirty(false); setOpenRow(null); setLastRow(record.id);
    }
    const waiting = updated.records.filter(r => waitingOnChain(r, updated.hierarchy.byRecord[r.id])).length;
    const reviews = updated.records.filter(r => needsDuplicateReview(r, updated.hierarchy.byRecord[r.id])).length;
    const fixing = updated.records.filter(r => r.status === 'NEEDS_FIXING').length - waiting - reviews;
    const ready = updated.records.filter(r => r.status === 'READY').length;
    const excluded = updated.records.filter(r => r.status === 'EXCLUDED').length;
    setSaveNotice({id: record?.id, name: record ? recordName(updated, record) : undefined, action: 'Validated',
      status: record ? statusText(record, updated) : undefined,
      reporting: record ? reportingFeedback(queryClient.getQueryData<OnboardingBatchDetail>(queryKey), updated, record.id, moved) : undefined,
      summary: `${action} · ${ready} ready · ${fixing} need fixing${reviews ? ` · ${reviews} need review` : ''} · ${waiting} waiting · ${excluded} excluded`,
      moved, ready: false, showView: !!record, sequence: ++noticeSequence.current});
    setViewportAction({kind: 'context', snapshot});
    queryClient.setQueryData(queryKey, updated);
  };

  const updateCountry = useMutation({
    onMutate: beginAction,
    mutationFn: (country: string) => EmsService.updateOnboardingBatchCountry(id, country, accessToken!),
    onSuccess: (updated) => {
      finishBatchAction(updated, 'Country updated and batch validated');
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      setCountryDraft(null);
    },
    onError: (error: Error) => failedAction('country', error),
  });

  const validate = useMutation({
    onMutate: beginAction,
    mutationFn: () => EmsService.validateOnboardingBatch(id, accessToken!),
    onSuccess: (updated) => finishBatchAction(updated, 'Validation complete'),
    onError: (error: Error) => failedAction('validate', error),
  });

  const save = useMutation({
    onMutate: () => { saveBaseline.current = queryClient.getQueryData<OnboardingBatchDetail>(queryKey); beginAction(); },
    mutationFn: (vars: { recordId: string; data: UpdateOnboardingRecordPayload }) =>
      EmsService.updateOnboardingRecord(vars.recordId, vars.data, accessToken!),
  });

  const saveHod = useMutation({
    onMutate: beginAction,
    mutationFn: (vars: {recordId: string; target: string; expectedVersion: string}) =>
      EmsService.updateOnboardingDepartmentHod(id, vars, accessToken!),
  });

  const confirmDuplicate = useMutation({
    onMutate: beginAction,
    mutationFn: (vars: { recordId: string; token: string }) =>
      EmsService.confirmOnboardingDifferentPerson(vars.recordId, vars.token, accessToken!),
    onSuccess: (updated, vars) => {
      finishRecordAction(updated, vars.recordId, 'Reviewed');
      queryClient.invalidateQueries({queryKey: ['ems-onboarding-batches']});
    },
  });

  const undoDuplicate = useMutation({
    onMutate: beginAction,
    mutationFn: (vars: { recordId: string; token: string }) =>
      EmsService.undoOnboardingDifferentPerson(vars.recordId, vars.token, accessToken!),
    onSuccess: (updated, vars) => {
      finishRecordAction(updated, vars.recordId, 'Confirmation undone');
      queryClient.invalidateQueries({queryKey: ['ems-onboarding-batches']});
    },
  });

  const exclude = useMutation({
    onMutate: beginAction,
    mutationFn: (vars: { recordId: string; reason: string }) =>
      EmsService.excludeOnboardingRecord(vars.recordId, vars.reason, accessToken!),
    onSuccess: (updated, variables) => finishRecordAction(updated, variables.recordId, 'Excluded'),
    onError: (error: Error, variables) => failedAction('exclude', error, variables.recordId),
  });

  const include = useMutation({
    onMutate: beginAction,
    mutationFn: (recordId: string) => EmsService.includeOnboardingRecord(recordId, accessToken!),
    onSuccess: (updated, recordId) => finishRecordAction(updated, recordId, 'Put back'),
    onError: (error: Error, recordId) => failedAction('include', error, recordId),
  });

  const register = useMutation({
    onMutate: beginAction,
    mutationFn: () => EmsService.registerOnboardingBatch(id, accessToken!),
    onSuccess: (result) => finishBatchAction(result.batch, `Registration complete · ${result.registered} registered · ${result.failed} failed`),
    onError: (error: Error) => { failedAction('register', error); queryClient.invalidateQueries({queryKey}); },
  });

  const error = queryError ? (queryError as any).message : null;
  const hierarchy = batch?.hierarchy;
  const records: OnboardingRecord[] = batch?.records ?? [];
  const busy = saveHod.isPending || undoDuplicate.isPending || confirmDuplicate.isPending || save.isPending || exclude.isPending || include.isPending ||
    updateCountry.isPending || validate.isPending || register.isPending;
  const country = countryDraft ?? batch?.defaultPhoneCountry ?? "";
  const countryUnsaved = country !== (batch?.defaultPhoneCountry ?? "");
  const closed = batch?.status === "CANCELLED" || batch?.status === "REGISTERED";
  const mutationError = actionError && !actionError.recordId ? actionError.message : null;

  const readyCount = records.filter((r) => r.status === "READY").length;
  const waitingCount = records.filter(r => waitingOnChain(r, hierarchy?.byRecord[r.id])).length;
  const reviewCount = records.filter(r => needsDuplicateReview(r, hierarchy?.byRecord[r.id])).length;
  const problemCount = records.filter((r) => r.status === "NEEDS_FIXING").length - waitingCount - reviewCount;
  const registeredCount = records.filter((r) => r.status === "REGISTERED").length;
  const displayedRecords = records.filter(r => matchingIds.has(r.id) || r.id === openRow || r.id === revealedId);
  const extraCount = displayedRecords.length - matchingIds.size;
  const departments = [...new Map(records.map(r => [departmentKey(r.currentDepartment),
    {key: departmentKey(r.currentDepartment), label: r.currentDepartment?.trim().replace(/\s+/g, ' ') || 'Not provided'}])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  const selectedTarget = filterModel.canonical(filters.reportingTarget);

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div ref={pageRef} data-onboarding-page style={{overflowAnchor: 'none', paddingBottom: '40vh'}}>
        {(saveNotice || returnPoints.length > 0 || externalReturn) && <div data-onboarding-feedback style={{bottom: 'var(--ems-feedback-bottom, 16px)'}} className={`fixed right-4 z-50 max-w-sm rounded-xl border-2 ${saveNotice?.moved ? 'border-purple-800' : 'border-slate-400'} bg-white shadow-lg`} role="status" aria-live="polite">
          {saveNotice && <SaveFeedback key={saveNotice.sequence} notice={saveNotice} hasReturn={returnPoints.length > 0} disabled={busy} onView={viewSavedRow} onDismiss={dismissNotice} />}
          {returnPoints.length > 0 && <button type="button" disabled={busy} onClick={returnToRecord} className={`mx-2 mb-2 py-1 text-sm ${FEEDBACK_LINK}`}>{(() => {
            const point = returnPoints[returnPoints.length - 1];
            return point.name ? `Return to ${point.name}` : 'Return to previous place';
          })()}</button>}
          {returnPoints.length === 0 && externalReturn && <Link href={externalReturn}
            onClick={event => { if (busy || !mayLeaveEditor()) event.preventDefault(); }}
            className={`mx-3 my-2 block py-1 text-sm ${FEEDBACK_LINK}`}>Return to review record</Link>}
        </div>}

        <div className="space-y-5">
        <div className="flex items-center gap-3" data-viewport-anchor="batch-heading">
          <Link href="/ems/onboarding" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">{batch?.label ?? "Import"}</h1>
            <p className="text-sm text-slate-500">
              {batch
                ? `${records.length} records · ${readyCount} ready · ${problemCount} need fixing${reviewCount ? ` · ${reviewCount} need review` : ''} · ${waitingCount} waiting on reporting chain · ${registeredCount} registered · ${BATCH_STATUS_LABELS[batch.status]}`
                : "Loading…"}
            </p>
            {register.isSuccess && (
              <p className="text-xs text-emerald-700">
                {register.data.registered} registered
                {register.data.failed > 0 && `, ${register.data.failed} failed`}
              </p>
          )}
          </div>
          <button
            onClick={() => validate.mutate()}
            disabled={busy || editorDirty || !batch || closed || countryUnsaved}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {validate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Validate all
          </button>

          <button
            onClick={() => register.mutate()}
            disabled={busy || editorDirty || readyCount === 0 || closed || countryUnsaved}
            title={readyCount === 0 ? "No records are ready to register" : undefined}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {register.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Register all {readyCount} ready
          </button>

          {/*<button
            disabled
            title="Not implemented yet"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register {readyCount}
          </button>*/}
        </div>

        {batch && <div data-channel-notice aria-live="polite" className={`text-sm ${channelError || (!channelLoading && !channelData?.communicationChannel) ? 'text-amber-800' : 'text-slate-600'}`}>
          {channelLoading || (channelFetching && channelError) ? 'Checking communication channel…'
            : channelError ? <>
                Communication channel could not be confirmed.{' '}
                <button type="button" onClick={() => void refetchChannel()} disabled={channelFetching}
                  className="font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 disabled:opacity-50">Retry</button>
              </>
            : channelData?.communicationChannel === 'EMAIL' ? 'Communication channel: Email · Work email required.'
            : channelData?.communicationChannel === 'WHATSAPP' ? 'Communication channel: WhatsApp · WhatsApp number required.'
            : 'Communication channel not set · Choose Email or WhatsApp before registering.'}
        </div>}

        {batch && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" data-viewport-anchor="batch-country">
            <label htmlFor="batch-phone-country" className="block text-sm font-semibold text-slate-700">
              Default country for phone numbers
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select id="batch-phone-country" value={country}
                onChange={(event) => { setCountryDraft(event.target.value); updateCountry.reset(); }}
                disabled={busy || editorDirty || closed || (!!batch.defaultPhoneCountry && registeredCount > 0)}
                aria-describedby="batch-phone-country-help"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Choose a country</option>
                {PHONE_COUNTRIES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
              </select>
              <button type="button" onClick={() => updateCountry.mutate(country)}
                disabled={busy || editorDirty || closed || !country || !countryUnsaved}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {updateCountry.isPending ? "Saving…" : "Save country & revalidate"}
              </button>
            </div>
            <p id="batch-phone-country-help" className="text-xs text-slate-500">
              Used for local phone numbers in this import. Numbers beginning with + keep their country code.
              For people in other countries, enter + and their country code. Saving checks pending records again;
              it does not change registered employees or existing logins.
            </p>
            {!batch.defaultPhoneCountry && <p className="text-xs text-amber-700">This older import has no default country. Choose one for local numbers, or enter every number with + and its country code.</p>}
            {countryUnsaved && <p className="text-xs text-amber-700">Save the country before validating or registering records.</p>}
            {!!batch.defaultPhoneCountry && registeredCount > 0 && <p className="text-xs text-slate-500">The country is fixed because registration has started.</p>}
          </div>
        )}
        {editorDirty && <p role="status" className="text-sm text-amber-800">An open record has unsaved changes. Save that record before validating all, changing the country, or registering.</p>}
        {mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}

        {batch && <section aria-label="Filter records" data-viewport-anchor="batch-filters" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Filter records</p>
            <button type="button" disabled={busy || !filterActive} onClick={() => changeFilters(EMPTY_FILTERS)}
              className="text-sm text-blue-700 underline disabled:opacity-40">Clear filters</button>
          </div>
          <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 disabled:opacity-60">
            <div className="min-w-0 text-xs font-medium text-slate-600"><label htmlFor="onboarding-filter-name">Name or employee code</label>
              <input id="onboarding-filter-name" type="search" value={filters.search} onChange={event => changeFilters({...filters, search: event.target.value})}
                placeholder="Search this import" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600"><label htmlFor="onboarding-filter-department">Department</label>
              <select id="onboarding-filter-department" value={filters.department} onChange={event => changeFilters({...filters, department: event.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                <option value="">All departments</option>
                {filters.department && !departments.some(d => d.key === filters.department) && <option value={filters.department}>{filters.department === 'MISSING' ? 'Not provided' : filters.department.replace(/^department:/, '')} (no records)</option>}
                {departments.map(department => <option key={department.key} value={department.key}>{department.label}</option>)}
              </select>
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600"><label htmlFor="onboarding-filter-status">Status</label>
              <select id="onboarding-filter-status" value={filters.status} onChange={event => changeFilters({...filters, status: event.target.value as RecordFilters['status']})}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                <option value="">All statuses</option>
                <option value="READY">Ready</option><option value="NEEDS_FIXING">Needs fixing</option>
                <option value="NEEDS_REVIEW">Needs review</option><option value="WAITING">Waiting on reporting chain</option><option value="DRAFT">Draft</option>
                <option value="EXCLUDED">Excluded</option><option value="REGISTERED">Registered</option>
              </select>
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600 sm:col-span-2"><label htmlFor="onboarding-filter-reporting">Reporting branch</label>
              <select id="onboarding-filter-reporting" value={selectedTarget} onChange={event => changeFilters({...filters, reportingTarget: event.target.value,
                reportingLabel: event.target.selectedOptions[0]?.text ?? ''})}
                aria-describedby="reporting-filter-help" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                <option value="">All reporting branches</option><option value="BOARD">Board</option>
                {selectedTarget && selectedTarget !== 'BOARD' && !filterModel.people.some(p => p.target === selectedTarget) && <option value={selectedTarget}>{filters.reportingLabel} (no current links)</option>}
                {filterModel.people.map(person => <option key={person.target} value={person.target}>{person.label}</option>)}
              </select>
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600"><label htmlFor="onboarding-filter-scope">Branch scope</label>
              <select id="onboarding-filter-scope" value={filters.scope} disabled={!filters.reportingTarget || busy}
                onChange={event => changeFilters({...filters, scope: event.target.value as RecordFilters['scope']})}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-50">
                <option value="BRANCH">Person + full branch</option><option value="DIRECT">Direct reports only</option>
              </select>
            </div>
          </fieldset>
          <p id="reporting-filter-help" className="text-xs text-slate-500">Filters combine. Full branch includes the selected person and their known descendants. Direct reports shows only the next level. Only records in this import are listed.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <p role="status" aria-live="polite" className="font-medium text-slate-700" data-filter-count>
              Showing {matchingIds.size} of {records.length} records{extraCount > 0 && ` · ${extraCount} extra shown outside filters`}
            </p>
            {extraCount > 0 && <button type="button" disabled={busy} onClick={hideExtraRecords}
              className="text-blue-700 underline disabled:opacity-50">Hide extra {extraCount === 1 ? 'record' : 'records'}</button>}
          </div>
          {filterActive && <p className="text-xs text-slate-500">Filters change this view. Validate all checks the batch; Register all registers all {readyCount} ready records in the batch.</p>}
        </section>}

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-clip">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : (
            <table className="w-full text-sm">
              <caption className="px-4 py-3 text-left text-xs text-slate-500">
                Reporting order: confirmed levels first, then incomplete historical chains with managers before reports. Problems follow; excluded rows are last. A valid manager assignment may remain pending after registration.
                Row numbers refer to the spreadsheet. Reporting errors must be resolved before registration.
              </caption>
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="w-10 px-3 py-3" />
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Row</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedRecords.map((rec) => {
                  const resolution = hierarchy?.byRecord[rec.id];
                  const waiting = waitingOnChain(rec, resolution);
                  const open = openRow === rec.id;
                  const recent = !open && lastRow === rec.id;
                  return (
                    <Fragment key={rec.id}>
                      <tr
                        key={rec.id}
                        ref={element => { if (element) rowRefs.current.set(rec.id, element); else rowRefs.current.delete(rec.id); }}
                        tabIndex={0}
                        aria-expanded={open}
                        aria-controls={open ? `editor-${rec.id}` : undefined}
                        data-viewport-anchor={`row:${rec.id}`} data-record-id={rec.id}
                        onClick={() => toggleRow(rec.id)}
                        onKeyDown={event => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault(); toggleRow(rec.id);
                          }
                        }}
                        className={`transition-colors cursor-pointer align-top ${open ? "bg-blue-50" : recent ? "bg-amber-50" : "hover:bg-slate-50"}`}
                      >
                        <td className={`px-3 py-3 border-l-4 ${open ? "border-blue-500 text-blue-500" : recent ? "border-amber-400 text-amber-500" : "border-transparent text-slate-300"}`}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{rec.rowNumber ?? "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{rec.employeeCode ?? "—"}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {[rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(" ") || "—"}
                          </p>
                          {!matchingIds.has(rec.id) && <p className="mt-1 text-xs font-medium text-blue-700">Shown outside filters{open ? ' · open record' : ''}</p>}
                          {(!open || resolution?.errorScope === 'UPSTREAM') && hierarchy?.byRecord[rec.id]?.error && !rec.validationErrors?.some(e => e.field === 'reportingToName') && (
                            <p className={`mt-1 text-xs ${resolution?.errorScope === 'UPSTREAM' ? 'text-amber-700' : 'text-red-600'}`}>{hierarchy.byRecord[rec.id].error} {rec.status === 'REGISTERED' ? 'Registration is preserved; correct reporting on the employee profile.' : 'Save or validate to refresh the record status.'}</p>
                          )}
                          {rec.validationErrors?.some(err => !open || isChainFinding(err.field, resolution)) && (
                            <ul className="mt-1 space-y-0.5">
                              {rec.validationErrors.filter(err => !open || isChainFinding(err.field, resolution)).map((err, i) => (
                                <li key={i} className={`flex items-start gap-1 text-xs ${isChainFinding(err.field, resolution) || err.field === 'duplicateReview' ? 'text-amber-700' : 'text-red-600'}`}>
                                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                  {isChainFinding(err.field, resolution) ? (resolution?.error ?? err.message) : err.field === 'duplicateReview' ? err.message : `${err.field}: ${err.message}`}
                                </li>
                              ))}
                            </ul>
                          )}
                          {rec.status !== 'EXCLUDED' && <ReportingChain resolution={resolution} currentId={rec.id} onVisit={visitRow} disabled={busy} />}
                          {rec.exclusionReason && (
                            <p className="mt-1 text-xs text-slate-400 italic">{rec.exclusionReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{rec.currentDepartment ?? "—"}</td>
                        <td className="px-4 py-3">
                          <RecordStatusPill status={rec.status} waiting={waiting} review={needsDuplicateReview(rec, resolution)} />
                          {rec.status !== 'EXCLUDED' && hierarchy?.byRecord[rec.id] && (
                            <p className={`mt-2 text-xs ${resolution?.errorScope === 'UPSTREAM' ? 'text-amber-700' : hierarchy.byRecord[rec.id].error ? 'text-red-600' : 'text-slate-600'}`}>
                              {resolution?.errorScope === 'UPSTREAM' ? 'Reporting chain needs attention' : REPORTING_STATE_LABELS[hierarchy.byRecord[rec.id].state]}
                            </p>
                          )}
                          {!resolution?.error && resolution?.warning && <p className="mt-1 text-xs text-amber-700">{resolution.chain?.length
                            ? resolution.state === 'PENDING' ? `Awaiting ${resolution.managerName || 'manager'}’s registration.` : 'Further reporting details shown in chain.'
                            : resolution.warning}</p>}
                          {rec.status === 'REGISTERED' && rec.employeeId && (
                            <Link onClick={e => e.stopPropagation()} href={`/ems/employees/${rec.employeeId}#reporting-manager`} className="mt-2 inline-block text-xs text-blue-600 underline">View reporting assignment</Link>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${rec.id}-editor`} id={`editor-${rec.id}`}>
                          <td colSpan={6} className="p-0 border-l-4 border-blue-500">
                            <RecordEditor
                              record={rec}
                              batch={batch!}
                              reportingOptions={hierarchy?.options ?? []}
                              reportingSuggestions={hierarchy?.suggestionsByRecord?.[rec.id] ?? []}
                              onDirtyChange={onDirtyChange}
                              reviewSequence={saveNotice?.id === rec.id ? saveNotice.sequence : 0}
                              reportingResolution={hierarchy?.byRecord[rec.id]}
                              required={required}
                              saving={busy || countryUnsaved || closed}
                              exclusionError={
                                actionError?.kind === 'exclude' && actionError.recordId === rec.id
                                  ? actionError.message
                                  : undefined
                              }
                              inclusionError={actionError?.kind === 'include' && actionError.recordId === rec.id ? actionError.message : undefined}
                              onSaveHod={(target, expectedVersion) => saveHod.mutateAsync({recordId: rec.id, target, expectedVersion})}
                              onHodSaved={updated => { finishRecordAction(updated, rec.id, 'Reviewed'); queryClient.invalidateQueries({queryKey: ['ems-people-links']}); queryClient.invalidateQueries({queryKey: ['ems-onboarding-batches']}); }}
                              onSave={(data) => save.mutateAsync({ recordId: rec.id, data })}
                              onSaved={updated => finishRecordAction(updated, rec.id, 'Saved')}
                              onConfirmDuplicate={async token => { await confirmDuplicate.mutateAsync({recordId: rec.id, token}); }}
                              onUndoDuplicate={async token => { await undoDuplicate.mutateAsync({recordId: rec.id, token}); }}
                              reviewReturnTo={externalReturn}
                              onVisit={targetId => visitRow(targetId, rec.id)}
                              onRefreshDuplicates={() => { queryClient.invalidateQueries({queryKey}); }}
                              onExclude={(reason) => exclude.mutate({ recordId: rec.id, reason })}
                              onInclude={() => include.mutate(rec.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {displayedRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                      {records.length === 0 ? 'No records in this import.' : 'No records match these filters. Change or clear the filters above.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
