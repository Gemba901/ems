import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'db';
import { normaliseKey } from './onboarding-text';
import { recordedHodSuggestions } from './onboarding-hod-suggestions';
import { branchKey, LinkPerson, LinkRecord, peopleIndex, personName,
  RecordPeopleLinks, resolveBatchPeopleLinks, scopeKey } from './onboarding-people-links';

const PERSON_SELECT = { id: true, firstName: true, middleName: true, lastName: true, jobTitle: true,
  employeeCode: true, plantBranch: true, departmentId: true, hodName: true, hodDesignation: true, department: { select: { name: true } },
  firstRelieverId: true, secondRelieverId: true, pendingFirstRelieverRecordId: true, pendingSecondRelieverRecordId: true } as const;

type PeopleLinkSnapshot = {
  employees: Prisma.EmployeeGetPayload<{ select: typeof PERSON_SELECT }>[];
  departments: { id: string; name: string }[];
};

/** Call mutations inside the caller's organisation lock and transaction. */
export async function loadPeopleLinks(db: Prisma.TransactionClient, organizationId: string, rows: readonly LinkRecord[] = [], snapshot?: PeopleLinkSnapshot) {
  const [employees, departments, assignments] = await Promise.all([
    snapshot ? Promise.resolve(snapshot.employees) : db.employee.findMany({ where: { organizationId }, select: PERSON_SELECT }),
    snapshot ? Promise.resolve(snapshot.departments) : db.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    db.emsDepartmentHod.findMany({ where: { department: { organizationId } } }),
  ]);
  const ids = [...new Set([...employees.flatMap(e => [e.pendingFirstRelieverRecordId, e.pendingSecondRelieverRecordId]),
    ...assignments.map(a => a.pendingRecordId)].filter((id): id is string => !!id))];
  const referenced = ids.length ? await db.emsOnboardingRecord.findMany({
    where: { organizationId, id: { in: ids } }, include: { batch: { select: { status: true } } },
  }) : [];
  const records = [...new Map([...referenced, ...rows].map(r => [r.id, r])).values()];
  const options: LinkPerson[] = employees.map(e => ({ target: `employee:${e.id}`, employeeId: e.id,
    name: personName(e), designation: e.jobTitle ?? '', employeeCode: e.employeeCode ?? '', department: e.department?.name ?? '', branch: e.plantBranch ?? '' }));
  for (const r of records) if (r.status !== 'REGISTERED') options.push({ target: `record:${r.id}`, recordId: r.id, batchId: r.batchId,
    name: personName(r), designation: r.jobDesignation ?? '', employeeCode: r.employeeCode ?? '', department: r.currentDepartment ?? '', branch: r.plantBranchCode ?? '',
    unavailable: r.status === 'EXCLUDED' || r.batch?.status === 'CANCELLED' });
  const resolved = resolveBatchPeopleLinks(rows, options, departments, assignments, records);
  const recordedSuggestions = recordedHodSuggestions(employees, options);
  for (const links of Object.values(resolved.byRecord)) {
    links.hod.recordedSuggestions = links.hod.departmentId
      ? recordedSuggestions.get(scopeKey(links.hod.departmentId, links.hod.branchKey)) ?? [] : [];
  }
  return { ...resolved, recordedSuggestions, employees, departments, assignments, records, allOptions: options };
}

export async function saveDepartmentHod(db: Prisma.TransactionClient, organizationId: string, batchId: string,
  recordId: string, target: string, expectedVersion: string, userId: string) {
  if (!userId) throw new BadRequestException('An authenticated HR reviewer is required');
  const batch = await db.emsOnboardingBatch.findFirst({ where: { id: batchId, organizationId }, include: { records: true } });
  const record = batch?.records.find(r => r.id === recordId);
  if (!batch || !record) throw new NotFoundException('Import record not found');
  if (batch.status === 'CANCELLED' || ['REGISTERED', 'EXCLUDED'].includes(record.status))
    throw new BadRequestException('Use an active import record to review its department HOD');
  const context = await loadPeopleLinks(db, organizationId, batch.records);
  const hod = context.byRecord[recordId].hod;
  if (!hod.departmentId) throw new BadRequestException('Save a recognised, unique department before choosing its HOD');
  if (hod.version !== expectedVersion) throw new ConflictException('The department or HOD choice changed. Refresh and review it again.');
  const current = context.assignments.find(a => a.departmentId === hod.departmentId && a.branchKey === hod.branchKey);
  const index = peopleIndex(context.allOptions, context.records);
  const resolved = index.resolve(target, 'Department HOD');
  if (!target || (target !== 'NONE' && !target.startsWith('employee:') && !target.startsWith('record:')))
    throw new BadRequestException('Choose a HOD or explicitly choose Not assigned');
  if (resolved.error) throw new BadRequestException(resolved.error);
  // An existing pending HOD from another import may be retained, but cannot be newly selected here.
  const currentTarget = current?.employeeId ? `employee:${current.employeeId}` : current?.pendingRecordId ? `record:${current.pendingRecordId}` : null;
  if (target.startsWith('record:') && !batch.records.some(r => `record:${r.id}` === target)
    && index.canonical(target) !== index.canonical(currentTarget))
    throw new BadRequestException('Choose a person in this import or an existing employee');
  const sameChoice = current && current.isUnassigned === (target === 'NONE')
    && index.canonical(currentTarget) === resolved.target;
  const revision = current ? current.revision + (sameChoice ? 0 : 1) : 1;
  const selection = { employeeId: resolved.target?.startsWith('employee:') ? resolved.target.slice(9) : null,
    pendingRecordId: resolved.target?.startsWith('record:') ? resolved.target.slice(7) : null,
    isUnassigned: target === 'NONE', revision, branchLabel: record.plantBranchCode?.trim() ?? '', updatedByUserId: userId };
  const saved = await db.emsDepartmentHod.upsert({
    where: { departmentId_branchKey: { departmentId: hod.departmentId, branchKey: hod.branchKey } },
    create: { ...selection, departmentId: hod.departmentId, branchKey: hod.branchKey }, update: selection,
  });
  const ids = batch.records.filter(r => !['REGISTERED', 'EXCLUDED'].includes(r.status)
    && normaliseKey(r.currentDepartment) === normaliseKey(record.currentDepartment) && branchKey(r.plantBranchCode) === hod.branchKey).map(r => r.id);
  // Preserve imported text as evidence; confirmation binds this batch's scope to the reviewed department revision.
  await db.emsOnboardingRecord.updateMany({ where: { organizationId, batchId, id: { in: ids }, status: { notIn: ['REGISTERED', 'EXCLUDED'] } },
    data: { hodReviewKey: `${saved.id}:${saved.revision}` } });
}

export async function relieverDraftData(db: Prisma.TransactionClient, organizationId: string, rows: readonly LinkRecord[], record: LinkRecord,
  dto: { reliever1Target?: string; reliever2Target?: string; reliever1Name?: string | null; reliever1Designation?: string | null; reliever2Name?: string | null; reliever2Designation?: string | null }) {
  const data: Record<string, string | null> = {};
  const hasChanges = ([1, 2] as const).some(slot => dto[`reliever${slot}Target`] !== undefined
    || (dto[`reliever${slot}Name`] !== undefined && dto[`reliever${slot}Name`] !== record[`reliever${slot}Name`])
    || (dto[`reliever${slot}Designation`] !== undefined && dto[`reliever${slot}Designation`] !== record[`reliever${slot}Designation`]));
  if (!hasChanges) return data;
  const context = await loadPeopleLinks(db, organizationId, rows), index = peopleIndex(context.allOptions, context.records);
  for (const slot of [1, 2] as const) {
    const prefix = `reliever${slot}` as const, target = dto[`${prefix}Target`];
    const changed = target !== undefined || (dto[`${prefix}Name`] !== undefined && dto[`${prefix}Name`] !== record[`${prefix}Name`])
      || (dto[`${prefix}Designation`] !== undefined && dto[`${prefix}Designation`] !== record[`${prefix}Designation`]);
    if (!changed) continue;
    data[`${prefix}RecordId`] = null; data[`${prefix}EmployeeId`] = null;
    if (target === 'NONE') { data[`${prefix}Name`] = null; data[`${prefix}Designation`] = null; continue; }
    if (!target) continue; // Resolve editable imported text at validation.
    const resolved = index.resolve(target, `${slot === 1 ? 'First' : 'Second'} reliever`);
    const person = resolved.person;
    const source = target.startsWith('record:') ? rows.find(r => `record:${r.id}` === target) : null;
    if (!person || resolved.error || (target.startsWith('record:') && source?.batchId !== record.batchId))
      throw new BadRequestException('Choose a reliever in this import or an existing employee');
    if (index.canonical(target) === index.canonical(`record:${record.id}`) || (record.employeeId && target === `employee:${record.employeeId}`))
      throw new BadRequestException('A person cannot be their own reliever');
    const storedTarget = person.target; // A selected import may have registered since the editor opened.
    data[`${prefix}${storedTarget.startsWith('record:') ? 'Record' : 'Employee'}Id`] = storedTarget.slice(storedTarget.indexOf(':') + 1);
    data[`${prefix}Name`] = person.name; data[`${prefix}Designation`] = person.designation;
  }
  return data;
}

export function registrationPeopleData(links: RecordPeopleLinks) {
  for (const resolution of [links.hod, links.first, links.second]) if (resolution.error) throw new BadRequestException(resolution.error);
  return {
    hodName: links.hod.person?.name ?? null, hodDesignation: links.hod.person?.designation ?? null,
    firstRelieverId: links.first.target?.startsWith('employee:') ? links.first.target.slice(9) : null,
    pendingFirstRelieverRecordId: links.first.target?.startsWith('record:') ? links.first.target.slice(7) : null,
    secondRelieverId: links.second.target?.startsWith('employee:') ? links.second.target.slice(9) : null,
    pendingSecondRelieverRecordId: links.second.target?.startsWith('record:') ? links.second.target.slice(7) : null,
  };
}

export async function resolvePendingPeopleLinks(db: Prisma.TransactionClient, organizationId: string) {
  const context = await loadPeopleLinks(db, organizationId), index = peopleIndex(context.allOptions, context.records);
  for (const employee of context.employees) for (const slot of ['First', 'Second'] as const) {
    const pendingField = `pending${slot}RelieverRecordId` as const, field = slot === 'First' ? 'firstRelieverId' : 'secondRelieverId';
    const pendingId = employee[pendingField];
    if (!pendingId) continue;
    const person = index.resolve(`record:${pendingId}`, `${slot} reliever`);
    if (person.error || !person.target?.startsWith('employee:') || person.target === `employee:${employee.id}`) continue;
    const other = slot === 'First' ? employee.secondRelieverId : employee.firstRelieverId;
    const otherPending = slot === 'First' ? employee.pendingSecondRelieverRecordId : employee.pendingFirstRelieverRecordId;
    if (person.target === (other ? `employee:${other}` : index.canonical(otherPending ? `record:${otherPending}` : null))) continue;
    await db.employee.updateMany({ where: { id: employee.id, organizationId, [pendingField]: pendingId, [field]: null },
      data: { [field]: person.target.slice(9), [pendingField]: null } });
  }
  for (const hod of context.assignments) {
    if (!hod.pendingRecordId || hod.isUnassigned || hod.employeeId) continue;
    const person = index.resolve(`record:${hod.pendingRecordId}`, 'Department HOD');
    if (person.error || !person.target?.startsWith('employee:')) continue;
    // Keep revision: registration completes the same reviewed choice; it is not an HR reassignment.
    await db.emsDepartmentHod.updateMany({ where: { id: hod.id, department: { organizationId }, pendingRecordId: hod.pendingRecordId,
      employeeId: null, isUnassigned: false, revision: hod.revision }, data: { employeeId: person.target.slice(9), pendingRecordId: null } });
  }
}

export async function employeePeopleLinks(db: Prisma.TransactionClient, organizationId: string, employeeId: string) {
  const context = await loadPeopleLinks(db, organizationId), index = peopleIndex(context.allOptions, context.records);
  const employee = context.employees.find(e => e.id === employeeId);
  if (!employee) throw new NotFoundException('Employee not found');
  const assignment = context.assignments.find(a => a.departmentId === employee.departmentId && a.branchKey === branchKey(employee.plantBranch));
  const hod = !assignment || assignment.isUnassigned ? index.resolve(null, 'Department HOD')
    : index.resolve(assignment.employeeId ? `employee:${assignment.employeeId}` : assignment.pendingRecordId ? `record:${assignment.pendingRecordId}` : '__missing__', 'Department HOD');
  const first = index.resolve(employee.firstRelieverId ? `employee:${employee.firstRelieverId}` : employee.pendingFirstRelieverRecordId ? `record:${employee.pendingFirstRelieverRecordId}` : null, 'First reliever');
  const second = index.resolve(employee.secondRelieverId ? `employee:${employee.secondRelieverId}` : employee.pendingSecondRelieverRecordId ? `record:${employee.pendingSecondRelieverRecordId}` : null, 'Second reliever');
  return { hod, first, second, departmentName: employee.department?.name ?? '', branchLabel: employee.plantBranch?.trim() || 'Branch not specified',
    departmentId: employee.departmentId, hasHodAssignment: !!assignment,
    hodDirectory: context.hodDirectory,
    recordedHodSuggestions: employee.departmentId ? context.recordedSuggestions.get(scopeKey(employee.departmentId, branchKey(employee.plantBranch))) ?? [] : [],
    previousHod: !assignment && (employee.hodName || employee.hodDesignation) ? {name: employee.hodName ?? '', designation: employee.hodDesignation ?? ''} : null,
    hodVersion: JSON.stringify([scopeKey(employee.departmentId ?? '', branchKey(employee.plantBranch)), assignment ? `${assignment.id}:${assignment.revision}` : null]),
    hodOptions: context.allOptions.filter(p => p.target.startsWith('employee:')),
    options: context.allOptions.filter(p => p.target.startsWith('employee:') && p.employeeId !== employeeId),
    version: JSON.stringify([employee.firstRelieverId, employee.pendingFirstRelieverRecordId, employee.secondRelieverId, employee.pendingSecondRelieverRecordId]) };
}

export async function saveEmployeeHod(db: Prisma.TransactionClient, organizationId: string, employeeId: string,
  target: string, expectedVersion: string, userId: string) {
  if (!userId) throw new BadRequestException('An authenticated HR reviewer is required');
  const current = await employeePeopleLinks(db, organizationId, employeeId);
  if (!current.departmentId) throw new BadRequestException('Assign a department before choosing its HOD');
  if (current.hodVersion !== expectedVersion) throw new ConflictException('The department or HOD changed. Refresh and review it again.');
  if (target === current.hod.target && current.hod.state === 'PENDING') return;
  if (target !== 'NONE' && !current.hodOptions.some(p => p.target === target))
    throw new BadRequestException('Choose an existing employee in this organization, or Not assigned');
  const context = await loadPeopleLinks(db, organizationId);
  const employee = context.employees.find(e => e.id === employeeId)!;
  const key = branchKey(employee.plantBranch);
  const previous = context.assignments.find(a => a.departmentId === current.departmentId && a.branchKey === key);
  const resolved = peopleIndex(context.allOptions, context.records).resolve(target, 'Department HOD');
  if (resolved.error) throw new BadRequestException(resolved.error);
  const sameChoice = previous?.isUnassigned === (target === 'NONE') && current.hod.target === (target === 'NONE' ? null : target);
  const selection = { employeeId: target === 'NONE' ? null : target.slice(9), pendingRecordId: null,
    isUnassigned: target === 'NONE', branchLabel: employee.plantBranch?.trim() ?? '', updatedByUserId: userId,
    revision: previous ? previous.revision + (sameChoice ? 0 : 1) : 1 };
  await db.emsDepartmentHod.upsert({ where: { departmentId_branchKey: { departmentId: current.departmentId, branchKey: key } },
    create: { ...selection, departmentId: current.departmentId, branchKey: key }, update: selection });
}

export async function saveEmployeeRelievers(db: Prisma.TransactionClient, organizationId: string, employeeId: string,
  first: string, second: string, expectedVersion: string) {
  const current = await employeePeopleLinks(db, organizationId, employeeId);
  if (current.version !== expectedVersion) throw new ConflictException('The reliever choices changed. Refresh and review them again.');
  const options = new Map(current.options.map(p => [p.target, p]));
  const index = peopleIndex(current.options);
  const data: Record<string, string | null> = {};
  for (const [slot, target, previous] of [['First', first, current.first], ['Second', second, current.second]] as const) {
    if (target === previous.target && previous.state === 'PENDING') continue;
    if (target !== 'NONE' && !options.has(target)) throw new BadRequestException('Choose an existing employee in this organization, or Not assigned');
    const resolved = index.resolve(target, `${slot} reliever`);
    if (resolved.error) throw new BadRequestException(resolved.error);
    data[slot === 'First' ? 'firstRelieverId' : 'secondRelieverId'] = target === 'NONE' ? null : target.slice(9);
    data[`pending${slot}RelieverRecordId`] = null;
  }
  if (first !== 'NONE' && first === second) throw new BadRequestException('First and second relievers must be different people');
  await db.employee.update({ where: { id: employeeId, organizationId }, data });
}

export async function assertPeopleLinksAllowBatchRemoval(db: Prisma.TransactionClient, organizationId: string, batchId: string) {
  const [employees, hods] = await Promise.all([
    db.employee.count({ where: { organizationId, OR: [
      { pendingFirstRelieverRecord: { batchId } }, { pendingSecondRelieverRecord: { batchId } },
    ] } }),
    db.emsDepartmentHod.count({ where: { department: { organizationId }, pendingRecord: { batchId } } }),
  ]);
  if (employees || hods) throw new BadRequestException('This import contains a pending HOD or reliever used by an employee or department. Choose replacements before cancelling or deleting it.');
}
