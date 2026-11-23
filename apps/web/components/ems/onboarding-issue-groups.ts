/** The review page's "Issue type" filter: which group(s) each validation finding belongs to. */
export type IssueGroup = 'missing' | 'contact' | 'department' | 'reporting' | 'relievers' | 'access' | 'duplicate' | 'format';
export type IssueFilter = '' | IssueGroup;

export const ISSUE_GROUPS: { value: IssueFilter; label: string }[] = [
  { value: '', label: 'All issue types' },
  { value: 'missing', label: 'Missing required' },
  { value: 'contact', label: 'Contact numbers & email' },
  { value: 'department', label: 'Department & HOD' },
  { value: 'reporting', label: 'Reporting line' },
  { value: 'relievers', label: 'Relievers' },
  { value: 'access', label: 'Access level' },
  { value: 'duplicate', label: 'Possible duplicates' },
  { value: 'format', label: 'Format & unrecognised values' },
];

/** Older addresses used these values; they open the nearest group. */
const LEGACY: Record<string, IssueFilter> = { imported: 'format', identity: 'format', work: 'format' };

export function issueFilterFromParam(value: string | null): IssueFilter | undefined {
  if (value === null) return undefined;
  if (ISSUE_GROUPS.some(option => option.value === value)) return value as IssueFilter;
  return LEGACY[value];
}

type Finding = { field: string; message: string; code?: string };

/** A required field that is blank, N/A, or the channel's missing contact. Messages come from the API's validation. */
export function isMissingRequired(finding: Finding): boolean {
  const message = finding.message;
  return finding.code === 'REQUIRED' || message === 'Required' || /N\/A is not accepted/.test(message)
    || /is required (to create a login|because your organisation)/.test(message)
    || (finding.field === 'reportingToName' && message.startsWith('Choose a reporting person, or leave the name blank'));
}

const DUPLICATE_MESSAGES = /Already used by an existing employee|Duplicated within this import|appears on another record in this import|already used by an employee in this company/;

/** Every group a finding belongs to; a missing contact is both "Missing required" and "Contact". "Format" catches the rest. */
export function issueGroupsOf(finding: Finding): IssueGroup[] {
  const { field, code, message } = finding;
  const groups: IssueGroup[] = [];
  if (isMissingRequired(finding)) groups.push('missing');
  if (field === 'duplicateReview' || code === 'DUPLICATE_PERSON' || DUPLICATE_MESSAGES.test(message)) groups.push('duplicate');
  if (['mobileNumber', 'whatsappNumber', 'workEmail'].includes(field)) groups.push('contact');
  else if (['currentDepartment', 'plantBranchCode', 'departmentHod'].includes(field) || /^hod/.test(field)) groups.push('department');
  else if (/^(reportingTo|reportingTarget)/.test(field)) groups.push('reporting');
  else if (/^reliever/.test(field)) groups.push('relievers');
  else if (field === 'beesAccessLevel') groups.push('access');
  else if (!groups.length) groups.push('format');
  return groups;
}

export const findingInGroup = (finding: Finding, group: IssueFilter) => !group || issueGroupsOf(finding).includes(group);
