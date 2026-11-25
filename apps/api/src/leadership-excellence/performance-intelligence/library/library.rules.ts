import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cleanText,
  validDate,
  validateDefinition,
} from '../../performance-planning/planning.rules';
import type {
  KpiDefinition,
  PlanningState,
} from '../../performance-planning/planning.types';
import type {
  DefinitionLibraryRecord,
  LibraryActor,
  LibraryCommand,
  LibraryContext,
  LibraryEntry,
  LibraryVersion,
  LibraryView,
} from './library.types';

const editors = ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'HR', 'HOD'];
export const libraryApproverRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGEMENT',
] as const;
export const canEditLibrary = (actor: LibraryActor) =>
  editors.includes(actor.role);
export const canApproveLibrary = (actor: LibraryActor) =>
  (libraryApproverRoles as readonly string[]).includes(actor.role);

export function readLibraryState(value: unknown): PlanningState {
  const state = value as PlanningState;
  if (
    !state ||
    state.schema !== 1 ||
    !Array.isArray(state.documents) ||
    !Array.isArray(state.kras) ||
    !Array.isArray(state.definitions) ||
    (state.definitionLibrary &&
      (state.definitionLibrary.schema !== 1 ||
        !Array.isArray(state.definitionLibrary.records)))
  )
    throw new ConflictException(
      'The planning library needs an updated application version.',
    );
  return structuredClone(state);
}

export function activeLibraryVersion(
  record: DefinitionLibraryRecord,
  today: string,
): LibraryVersion | undefined {
  return [...record.versions]
    .reverse()
    .find((version) => version.effectiveDate <= today);
}

function records(state: PlanningState): DefinitionLibraryRecord[] {
  const saved = state.definitionLibrary?.records || [];
  return [
    ...saved,
    ...state.definitions
      .filter(
        (definition) =>
          definition.source === 'CUSTOM' &&
          !saved.some((record) => record.definitionId === definition.id),
      )
      .map(
        (definition): DefinitionLibraryRecord => ({
          definitionId: definition.id,
          draft: structuredClone(definition),
          status: 'DRAFT',
          approverId: '',
          revisionReason: '',
          effectiveDate: '',
          versions: [],
          history: [],
        }),
      ),
  ];
}

function audit(
  record: DefinitionLibraryRecord,
  context: LibraryContext,
  action: string,
  detail: string,
) {
  record.history.push({
    id: randomUUID(),
    at: context.at,
    actorId: context.actor.userId,
    actorName: context.actor.name,
    actorRole: context.actor.role,
    action,
    detail,
  });
}

export function libraryView(
  state: PlanningState,
  revision: number,
  context: LibraryContext,
): LibraryView {
  const canEdit = canEditLibrary(context.actor),
    canApprove = canApproveLibrary(context.actor);
  const entries: LibraryEntry[] = state.definitions
    .filter((definition) => definition.source === 'REFERENCE')
    .map((definition) => ({
      definition: structuredClone(definition),
      status: 'REFERENCE',
      approverId: '',
      revisionReason: '',
      versions: [],
      history: [],
      permissions: {
        canEdit: false,
        canSubmit: false,
        canApprove: false,
        canReturn: false,
        canRevise: false,
        canAdapt: canEdit,
      },
    }));
  for (const record of records(state)) {
    const active = activeLibraryVersion(record, context.today),
      latest = record.versions.at(-1);
    if (!canEdit && !active) continue;
    const designated =
      canApprove &&
      record.approverId === context.actor.userId &&
      context.approvers.some((person) => person.id === context.actor.userId);
    entries.push({
      definition: structuredClone(canEdit ? record.draft : active!.definition),
      status: canEdit ? record.status : 'APPROVED',
      ...(latest && canEdit
        ? { approvedVersion: latest.version }
        : active
          ? { approvedVersion: active.version }
          : {}),
      ...(active ? { activeVersion: active.version } : {}),
      effectiveDate: canEdit
        ? record.effectiveDate || latest?.effectiveDate
        : active!.effectiveDate,
      approverId: canEdit ? record.approverId : active!.approvedBy,
      revisionReason: canEdit ? record.revisionReason : active!.reason,
      versions: structuredClone(
        canEdit
          ? record.versions
          : record.versions.filter(
              (version) => version.effectiveDate <= context.today,
            ),
      ),
      history: structuredClone(
        canEdit
          ? record.history
          : record.history.filter(
              (event) =>
                event.action === 'APPROVE' &&
                record.versions.some(
                  (version) =>
                    version.approvedAt === event.at &&
                    version.effectiveDate <= context.today,
                ),
            ),
      ),
      permissions: {
        canEdit: canEdit && record.status === 'DRAFT',
        canSubmit: canEdit && record.status === 'DRAFT',
        canApprove: designated && record.status === 'IN_REVIEW',
        canReturn: designated && record.status === 'IN_REVIEW',
        canRevise: canEdit && record.status === 'APPROVED',
        canAdapt: canEdit,
      },
    });
  }
  const visibleKras = new Set(entries.map((entry) => entry.definition.kraId));
  return {
    revision,
    today: context.today,
    canEdit,
    canApprove,
    approvers: canEdit ? structuredClone(context.approvers) : [],
    kras: structuredClone(
      state.kras.filter((kra) => canEdit || visibleKras.has(kra.id)),
    ),
    entries,
  };
}

export function assertUniqueLibraryDefinition(
  state: PlanningState,
  definition: KpiDefinition,
) {
  if (!definition.name) return;
  const candidates = [
    ...state.definitions,
    ...records(state).map((record) => record.draft),
  ];
  if (
    candidates.some(
      (item) =>
        item.id !== definition.id &&
        item.kraId === definition.kraId &&
        item.name.trim().toLowerCase() === definition.name.trim().toLowerCase(),
    )
  )
    throw new ConflictException(
      'That KPI already exists under this KRA. Reuse it or give the adapted definition a distinct name.',
    );
}

/** Capture Area 03 creations as unapproved drafts without changing their IDs. */
export function registerPlanningDefinitionDraft(
  state: PlanningState,
  definition: KpiDefinition,
  actor: LibraryActor,
  at = new Date().toISOString(),
) {
  state.definitionLibrary ??= { schema: 1, records: [] };
  const record: DefinitionLibraryRecord = {
    definitionId: definition.id,
    draft: structuredClone(definition),
    status: 'DRAFT',
    approverId: '',
    revisionReason: '',
    effectiveDate: '',
    versions: [],
    history: [],
  };
  audit(
    record,
    { actor, at, today: at.slice(0, 10), approvers: [] },
    'SAVE_DRAFT',
    'Created in performance planning; library approval is pending.',
  );
  state.definitionLibrary.records.push(record);
}

function getRecord(state: PlanningState, id: string): DefinitionLibraryRecord {
  state.definitionLibrary ??= { schema: 1, records: [] };
  let record = state.definitionLibrary.records.find(
    (item) => item.definitionId === id,
  );
  if (!record) {
    record = records(state).find((item) => item.definitionId === id);
    if (record) state.definitionLibrary.records.push(record);
  }
  if (!record)
    throw new NotFoundException(
      'Editable KPI not found in this organisation. Adapt reference examples into a company draft.',
    );
  return record;
}

function code(state: PlanningState, prefix: string) {
  state.sequence++;
  return `${prefix}-${String(state.sequence).padStart(4, '0')}`;
}

function saveDraft(
  state: PlanningState,
  command: LibraryCommand,
  context: LibraryContext,
): DefinitionLibraryRecord {
  const payload = command.payload;
  const existing = command.definitionId
    ? getRecord(state, command.definitionId)
    : undefined;
  if (existing && existing.status !== 'DRAFT')
    throw new ConflictException(
      'This definition is locked. Return it from review or open a dated revision before editing.',
    );
  const base: KpiDefinition = existing?.draft || {
    id: randomUUID(),
    code: code(state, 'KPI'),
    kraId: '',
    name: '',
    meaning: '',
    unit: '',
    direction: 'HIGHER',
    formula: 'DIRECT',
    inputA: '',
    inputB: '',
    aggregation: 'SUM',
    source: 'CUSTOM',
    dataSource: '',
    suggestedFrequency: '',
  };
  const definition = structuredClone(base);
  for (const [key, max] of [
    ['name', 160],
    ['meaning', 4000],
    ['unit', 40],
    ['inputA', 120],
    ['inputB', 120],
    ['dataSource', 1000],
  ] as const) {
    if (Object.hasOwn(payload, key))
      definition[key] = cleanText(payload[key], max);
  }
  for (const key of [
    'direction',
    'formula',
    'aggregation',
    'suggestedFrequency',
  ] as const) {
    if (Object.hasOwn(payload, key))
      (definition as unknown as Record<string, unknown>)[key] = cleanText(
        payload[key],
        40,
      );
  }
  if (Object.hasOwn(payload, 'kraId'))
    definition.kraId = cleanText(payload.kraId, 100);
  const kraName = cleanText(payload.kraName, 120),
    adaptedKraFromId = cleanText(payload.adaptedKraFromId, 100);
  if (
    adaptedKraFromId &&
    (definition.kraId || !state.kras.some((kra) => kra.id === adaptedKraFromId))
  )
    throw new BadRequestException(
      'Choose an existing KRA to adapt and enter a distinct new KRA name.',
    );
  if (!definition.kraId && kraName) {
    const kra = state.kras.find(
      (item) => item.name.trim().toLowerCase() === kraName.toLowerCase(),
    );
    if (kra && adaptedKraFromId)
      throw new ConflictException('Give the adapted KRA a distinct name.');
    definition.kraId = kra?.id || randomUUID();
    if (!kra)
      state.kras.push({
        id: definition.kraId,
        code: code(state, 'KRA'),
        name: kraName,
        ...(adaptedKraFromId ? { adaptedFromId: adaptedKraFromId } : {}),
      });
  }
  if (
    definition.kraId &&
    !state.kras.some((kra) => kra.id === definition.kraId)
  )
    throw new BadRequestException('Choose an existing KRA.');
  if (adaptedKraFromId && !kraName)
    throw new BadRequestException('Enter a name for the adapted KRA.');
  if (!existing) {
    const adaptedFromId = cleanText(payload.adaptedFromId, 100);
    if (adaptedFromId) {
      if (
        ![
          ...state.definitions,
          ...records(state).map((record) => record.draft),
        ].some((item) => item.id === adaptedFromId)
      )
        throw new BadRequestException('Choose an existing KPI to adapt.');
      definition.adaptedFromId = adaptedFromId;
    }
  }
  assertUniqueLibraryDefinition(state, definition);
  const record: DefinitionLibraryRecord = existing || {
    definitionId: definition.id,
    draft: definition,
    status: 'DRAFT',
    approverId: '',
    revisionReason: '',
    effectiveDate: '',
    versions: [],
    history: [],
  };
  record.draft = definition;
  if (Object.hasOwn(payload, 'approverId')) {
    const approverId = cleanText(payload.approverId, 100);
    if (
      approverId &&
      !context.approvers.some((person) => person.id === approverId)
    )
      throw new BadRequestException(
        'Choose an authorised approver in this organisation.',
      );
    record.approverId = approverId;
  }
  if (!existing) {
    state.definitionLibrary ??= { schema: 1, records: [] };
    state.definitionLibrary.records.push(record);
  }
  audit(
    record,
    context,
    'SAVE_DRAFT',
    existing
      ? 'Saved the working definition.'
      : definition.adaptedFromId
        ? `Adapted from ${definition.adaptedFromId}.`
        : 'Created a company KPI draft.',
  );
  return record;
}

function validateReady(
  state: PlanningState,
  record: DefinitionLibraryRecord,
  context: LibraryContext,
) {
  if (!state.kras.some((kra) => kra.id === record.draft.kraId))
    throw new BadRequestException(
      'Choose a KRA before submitting the definition.',
    );
  validateDefinition(record.draft);
  if (!record.draft.dataSource?.trim())
    throw new BadRequestException(
      'Describe the source of the KPI data before submitting.',
    );
  const frequencies = [
    'DAILY',
    'WEEKLY',
    'FORTNIGHTLY',
    'TWICE_MONTHLY',
    'MONTHLY',
    'EVERY_TWO_MONTHS',
    'CUSTOM',
    'QUARTERLY',
    'HALF_YEARLY',
    'YEARLY',
  ];
  if (
    record.draft.suggestedFrequency &&
    !frequencies.includes(record.draft.suggestedFrequency)
  )
    throw new BadRequestException(
      'Choose a valid suggested reporting frequency.',
    );
  if (!context.approvers.some((person) => person.id === record.approverId))
    throw new BadRequestException(
      'Choose one authorised approver in this organisation.',
    );
  assertUniqueLibraryDefinition(state, record.draft);
  if (record.versions.length && !record.revisionReason)
    throw new BadRequestException('A revision requires a reason.');
  if (
    record.effectiveDate &&
    (!validDate(record.effectiveDate) ||
      record.effectiveDate < context.today ||
      (record.versions.at(-1) &&
        record.effectiveDate <= record.versions.at(-1)!.effectiveDate))
  )
    throw new BadRequestException(
      'Choose an effective date of today or later, after the previous approved effective date.',
    );
  if (record.versions.length && !record.effectiveDate)
    throw new BadRequestException('A revision requires an effective date.');
}

/** Mutates only a transaction-local state clone. Approved plans and version snapshots are never rewritten. */
export function applyLibraryCommand(
  state: PlanningState,
  command: LibraryCommand,
  context: LibraryContext,
): string {
  if (!canEditLibrary(context.actor))
    throw new ForbiddenException(
      'Only authorised library editors can change definitions.',
    );
  if (command.action === 'SAVE_DRAFT')
    return saveDraft(state, command, context).definitionId;
  const record = getRecord(state, command.definitionId || '');
  if (command.action === 'SUBMIT') {
    if (record.status !== 'DRAFT')
      throw new ConflictException('Only a draft can be submitted for review.');
    if (Object.hasOwn(command.payload, 'approverId'))
      record.approverId = cleanText(command.payload.approverId, 100);
    if (Object.hasOwn(command.payload, 'effectiveDate'))
      record.effectiveDate = cleanText(command.payload.effectiveDate, 10);
    validateReady(state, record, context);
    record.status = 'IN_REVIEW';
    audit(
      record,
      context,
      'SUBMIT',
      `Submitted to ${record.approverId} for review.`,
    );
  } else if (command.action === 'REVISE') {
    if (record.status !== 'APPROVED')
      throw new ConflictException(
        'Only an approved definition can open a revision.',
      );
    const reason = cleanText(command.payload.reason, 2000),
      effectiveDate = cleanText(command.payload.effectiveDate, 10);
    if (
      !reason ||
      !validDate(effectiveDate) ||
      effectiveDate < context.today ||
      effectiveDate <= record.versions.at(-1)!.effectiveDate
    )
      throw new BadRequestException(
        'Enter a revision reason and an effective date of today or later, after the previous approved effective date.',
      );
    record.draft = structuredClone(record.versions.at(-1)!.definition);
    record.revisionReason = reason;
    record.effectiveDate = effectiveDate;
    if (Object.hasOwn(command.payload, 'approverId')) {
      const approverId = cleanText(command.payload.approverId, 100);
      if (!context.approvers.some((person) => person.id === approverId))
        throw new BadRequestException(
          'Choose an authorised approver in this organisation.',
        );
      record.approverId = approverId;
    }
    record.status = 'DRAFT';
    audit(record, context, 'REVISE', `${reason} Effective ${effectiveDate}.`);
  } else if (command.action === 'APPROVE' || command.action === 'RETURN') {
    if (
      !canApproveLibrary(context.actor) ||
      record.approverId !== context.actor.userId ||
      !context.approvers.some((person) => person.id === context.actor.userId)
    )
      throw new ForbiddenException(
        'Only the designated authorised approver can approve or return this definition.',
      );
    if (record.status !== 'IN_REVIEW')
      throw new ConflictException(
        'Submit the definition for review before an approval decision.',
      );
    if (command.action === 'RETURN') {
      const reason = cleanText(command.payload.reason, 2000);
      if (!reason)
        throw new BadRequestException('Explain the changes required.');
      record.status = 'DRAFT';
      audit(record, context, 'RETURN', reason);
    } else {
      if (Object.hasOwn(command.payload, 'effectiveDate')) {
        const effectiveDate = cleanText(command.payload.effectiveDate, 10);
        if (!validDate(effectiveDate))
          throw new BadRequestException(
            'Choose a valid approval effective date.',
          );
        record.effectiveDate = effectiveDate;
      }
      validateReady(state, record, context);
      const version: LibraryVersion = {
        version: (record.versions.at(-1)?.version || 0) + 1,
        definition: structuredClone(record.draft),
        kra: structuredClone(
          state.kras.find((kra) => kra.id === record.draft.kraId)!,
        ),
        approvedAt: context.at,
        approvedBy: context.actor.userId,
        approvedByName: context.actor.name,
        approvedByRole: context.actor.role,
        effectiveDate: record.effectiveDate || context.today,
        reason: record.revisionReason,
      };
      record.versions.push(version);
      record.effectiveDate = version.effectiveDate;
      record.status = 'APPROVED';
      const active = activeLibraryVersion(record, context.today);
      if (active) {
        const index = state.definitions.findIndex(
          (definition) => definition.id === record.definitionId,
        );
        if (index === -1)
          state.definitions.push(structuredClone(active.definition));
        else state.definitions[index] = structuredClone(active.definition);
      }
      audit(
        record,
        context,
        'APPROVE',
        `Approved version ${version.version}; effective ${version.effectiveDate}.`,
      );
    }
  } else throw new BadRequestException('Unknown library command.');
  return record.definitionId;
}

export function approvedPlanningLibrary(state: PlanningState, today: string) {
  const active = (state.definitionLibrary?.records || []).flatMap((record) => {
    const version = activeLibraryVersion(record, today);
    return version ? [version] : [];
  });
  return structuredClone({
    kras: [
      ...new Map(
        active.map((version) => [version.kra.id, version.kra]),
      ).values(),
    ],
    definitions: active.map((version) => version.definition),
  });
}

export function assertLibraryHistoryPreserved(
  current: PlanningState | undefined,
  restored: PlanningState,
) {
  // A signed old backup is not permission to roll back the library's governance.
  if (
    current?.definitionLibrary &&
    JSON.stringify(current.definitionLibrary) !==
      JSON.stringify(restored.definitionLibrary)
  )
    throw new BadRequestException(
      'This backup would remove or alter library drafts, approvals or audit history. Use a current backup.',
    );
  for (const record of current?.definitionLibrary?.records || []) {
    if (
      record.versions.length &&
      JSON.stringify(
        current!.definitions.find(
          (definition) => definition.id === record.definitionId,
        ),
      ) !==
        JSON.stringify(
          restored.definitions.find(
            (definition) => definition.id === record.definitionId,
          ),
        )
    )
      throw new BadRequestException(
        'This backup would alter an approved library definition.',
      );
  }
}
