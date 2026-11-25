import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { emptyPlanningState } from '../../performance-planning/planning.seed';
import type { PlanningState } from '../../performance-planning/planning.types';
import {
  activeLibraryVersion,
  applyLibraryCommand,
  approvedPlanningLibrary,
  assertLibraryHistoryPreserved,
  assertUniqueLibraryDefinition,
  libraryView,
  registerPlanningDefinitionDraft,
} from './library.rules';
import type { LibraryCommand, LibraryContext } from './library.types';

const editor: LibraryContext = {
  actor: { userId: 'hr', name: 'HR editor', role: 'HR' },
  approvers: [
    { id: 'manager', name: 'Manager' },
    { id: 'other-manager', name: 'Other manager' },
  ],
  today: '2026-11-23',
  at: '2026-11-23T09:00:00.000Z',
};
const approver: LibraryContext = {
  ...editor,
  actor: { userId: 'manager', name: 'Manager', role: 'MANAGEMENT' },
  at: '2026-11-23T10:00:00.000Z',
};
const employee: LibraryContext = {
  ...editor,
  actor: { userId: 'employee', name: 'Employee', role: 'EMPLOYEE' },
};
const fields = {
  kraId: 'ref-kra-quality',
  name: 'Accepted quality',
  meaning: 'Accepted units in the reviewed batch.',
  unit: 'units',
  direction: 'HIGHER',
  formula: 'DIRECT',
  inputA: 'Accepted units',
  inputB: '',
  aggregation: 'SUM',
  dataSource: 'Quality inspection register',
  suggestedFrequency: 'MONTHLY',
};

function fixture() {
  let state = emptyPlanningState();
  const run = (
    action: LibraryCommand['action'],
    definitionId?: string,
    payload: Record<string, unknown> = {},
    context = editor,
  ) => {
    const next = structuredClone(state);
    const id = applyLibraryCommand(
      next,
      { action, definitionId, expectedRevision: 0, payload },
      context,
    );
    state = next;
    return id;
  };
  const create = () => run('SAVE_DRAFT', undefined, fields);
  const approve = (id: string) => {
    run('SUBMIT', id, { approverId: 'manager' });
    run('APPROVE', id, {}, approver);
  };
  return {
    run,
    create,
    approve,
    get state() {
      return state;
    },
  };
}

describe('Area 07 definition library lifecycle', () => {
  it('saves incomplete drafts without publishing them and validates the complete measure only at submission', () => {
    const f = fixture();
    const id = f.run('SAVE_DRAFT');
    expect(f.state.definitions.some((definition) => definition.id === id)).toBe(
      false,
    );
    expect(f.state.definitionLibrary!.records[0].status).toBe('DRAFT');
    expect(() => f.run('SUBMIT', id, { approverId: 'manager' })).toThrow(
      BadRequestException,
    );
    f.run('SAVE_DRAFT', id, { ...fields, dataSource: '' });
    expect(() => f.run('SUBMIT', id, { approverId: 'manager' })).toThrow(
      'source',
    );
    f.run('SAVE_DRAFT', id, {
      dataSource: fields.dataSource,
      formula: 'PERCENT',
      inputB: '',
    });
    expect(() => f.run('SUBMIT', id, { approverId: 'manager' })).toThrow(
      'formula inputs',
    );
    f.run('SAVE_DRAFT', id, { inputB: 'Inspected units' });
    expect(() => f.run('SUBMIT', id, { approverId: 'manager' })).toThrow(
      'aggregate their inputs',
    );
    f.run('SAVE_DRAFT', id, { aggregation: 'RATIO' });
    f.run('SUBMIT', id, { approverId: 'manager' });
    expect(f.state.definitionLibrary!.records[0].status).toBe('IN_REVIEW');
  });

  it('requires the designated current approver, locks review/approval, and captures trusted provenance', () => {
    const f = fixture(),
      id = f.create();
    expect(() =>
      f.run('SUBMIT', id, { approverId: 'foreign-manager' }),
    ).toThrow(BadRequestException);
    f.run('SUBMIT', id, { approverId: 'manager' });
    expect(() => f.run('SAVE_DRAFT', id, fields)).toThrow(ConflictException);
    expect(() => f.run('APPROVE', id, {}, editor)).toThrow(ForbiddenException);
    expect(() =>
      f.run(
        'APPROVE',
        id,
        {},
        { ...approver, actor: { ...approver.actor, userId: 'other-manager' } },
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      f.run('APPROVE', id, {}, { ...approver, approvers: [] }),
    ).toThrow(ForbiddenException);
    f.run(
      'APPROVE',
      id,
      { approvedBy: 'spoof', approvedAt: '1999-01-01' },
      approver,
    );
    const record = f.state.definitionLibrary!.records[0];
    expect(record).toMatchObject({
      status: 'APPROVED',
      versions: [
        {
          version: 1,
          approvedBy: 'manager',
          approvedByName: 'Manager',
          approvedByRole: 'MANAGEMENT',
          approvedAt: approver.at,
        },
      ],
    });
    expect(record.history.at(-1)).toMatchObject({
      actorId: 'manager',
      actorName: 'Manager',
      actorRole: 'MANAGEMENT',
      at: approver.at,
      action: 'APPROVE',
    });
    expect(() => f.run('SAVE_DRAFT', id, fields)).toThrow(ConflictException);
    expect(() => f.run('APPROVE', id, {}, approver)).toThrow(ConflictException);
  });

  it('returns reviewed definitions with a required reason and resubmits to one approver', () => {
    const f = fixture(),
      id = f.create();
    f.run('SUBMIT', id, { approverId: 'manager' });
    expect(() => f.run('RETURN', id, {}, approver)).toThrow(
      BadRequestException,
    );
    f.run('RETURN', id, { reason: 'Clarify the inspection scope.' }, approver);
    f.run('SAVE_DRAFT', id, {
      meaning: 'Accepted units in the final inspection register.',
    });
    f.run('SUBMIT', id, { approverId: 'other-manager' });
    expect(() => f.run('APPROVE', id, {}, approver)).toThrow(
      ForbiddenException,
    );
    expect(
      f.state.definitionLibrary!.records[0].history.map(
        (event) => event.action,
      ),
    ).toEqual(['SAVE_DRAFT', 'SUBMIT', 'RETURN', 'SAVE_DRAFT', 'SUBMIT']);
  });

  it('retains the old approved definition and plan history until a dated revision becomes effective', () => {
    const f = fixture(),
      id = f.create();
    f.approve(id);
    const oldVersion = structuredClone(
      f.state.definitionLibrary!.records[0].versions[0],
    );
    f.state.documents.push({
      id: 'approved-plan',
      versions: [{ definitions: [structuredClone(oldVersion.definition)] }],
    } as unknown as PlanningState['documents'][number]);
    const plans = structuredClone(f.state.documents);
    for (const payload of [
      { reason: '', effectiveDate: '2026-12-01' },
      { reason: 'Revised scope', effectiveDate: '' },
      { reason: 'Revised scope', effectiveDate: '2026-02-30' },
      { reason: 'Revised scope', effectiveDate: '2026-11-22' },
      { reason: 'Revised scope', effectiveDate: '2026-11-23' },
    ])
      expect(() => f.run('REVISE', id, payload)).toThrow(BadRequestException);
    f.run('REVISE', id, {
      reason: 'New inspection scope',
      effectiveDate: '2026-12-01',
    });
    f.run('SAVE_DRAFT', id, { meaning: 'Revised inspection scope' });
    expect(
      f.state.definitions.find((definition) => definition.id === id),
    ).toEqual(oldVersion.definition);
    expect(approvedPlanningLibrary(f.state, '2026-11-23').definitions).toEqual([
      oldVersion.definition,
    ]);
    f.run('SUBMIT', id, { approverId: 'manager' });
    f.run('APPROVE', id, {}, approver);
    const record = f.state.definitionLibrary!.records[0];
    expect(record.versions[0]).toEqual(oldVersion);
    expect(record.versions[1]).toMatchObject({
      version: 2,
      reason: 'New inspection scope',
      effectiveDate: '2026-12-01',
      definition: {
        id,
        code: oldVersion.definition.code,
        meaning: 'Revised inspection scope',
      },
    });
    expect(activeLibraryVersion(record, '2026-11-30')!.version).toBe(1);
    expect(activeLibraryVersion(record, '2026-12-01')!.version).toBe(2);
    expect(
      approvedPlanningLibrary(f.state, '2026-12-01').definitions[0].meaning,
    ).toBe('Revised inspection scope');
    expect(f.state.documents).toEqual(plans);
    expect(
      f.state.definitions.find((definition) => definition.id === id),
    ).toEqual(oldVersion.definition);
  });

  it('keeps scheduled first approvals out of active planning references until their effective date', () => {
    const f = fixture(),
      id = f.create();
    f.run('SUBMIT', id, { approverId: 'manager', effectiveDate: '2026-12-01' });
    f.run('APPROVE', id, {}, approver);
    expect(approvedPlanningLibrary(f.state, '2026-11-30').definitions).toEqual(
      [],
    );
    expect(
      libraryView(f.state, 4, employee).entries.some(
        (entry) => entry.definition.id === id,
      ),
    ).toBe(false);
    expect(
      approvedPlanningLibrary(f.state, '2026-12-01').definitions[0].id,
    ).toBe(id);
  });

  it('allows a delayed reviewer to explicitly choose a new effective date without silently changing the submitted date', () => {
    const f = fixture(),
      id = f.create();
    f.run('SUBMIT', id, { approverId: 'manager', effectiveDate: '2026-11-23' });
    const tomorrow = {
      ...approver,
      today: '2026-11-24',
      at: '2026-11-24T10:00:00.000Z',
    };
    expect(() => f.run('APPROVE', id, {}, tomorrow)).toThrow(
      BadRequestException,
    );
    expect(f.state.definitionLibrary!.records[0].effectiveDate).toBe(
      '2026-11-23',
    );
    expect(() => f.run('APPROVE', id, { effectiveDate: '' }, tomorrow)).toThrow(
      BadRequestException,
    );
    expect(() =>
      f.run('APPROVE', id, { effectiveDate: '2026-11-23' }, tomorrow),
    ).toThrow(BadRequestException);
    f.run('APPROVE', id, { effectiveDate: '2026-11-24' }, tomorrow);
    expect(f.state.definitionLibrary!.records[0].versions[0]).toMatchObject({
      effectiveDate: '2026-11-24',
      approvedAt: tomorrow.at,
    });
    expect(
      f.state.definitionLibrary!.records[0].history.at(-1)!.detail,
    ).toContain('2026-11-24');
  });

  it('never interprets CUSTOM or a legacy assignment as library approval', () => {
    const state = emptyPlanningState();
    state.definitions.push({
      ...state.definitions[0],
      id: 'legacy-custom',
      name: 'Legacy custom',
      source: 'CUSTOM',
    });
    expect(approvedPlanningLibrary(state, editor.today).definitions).toEqual(
      [],
    );
    expect(
      libraryView(state, 0, editor).entries.find(
        (entry) => entry.definition.id === 'legacy-custom',
      )!.status,
    ).toBe('DRAFT');
    expect(
      libraryView(state, 0, employee).entries.every(
        (entry) => entry.status === 'REFERENCE',
      ),
    ).toBe(true);
  });

  it('restricts employees to active approved/reference content and hides working revisions and future snapshots', () => {
    const f = fixture(),
      id = f.create();
    f.approve(id);
    f.run('REVISE', id, {
      reason: 'Private future change',
      effectiveDate: '2026-12-01',
    });
    f.run('SAVE_DRAFT', id, { meaning: 'Private draft meaning' });
    expect(() => f.run('SAVE_DRAFT', id, fields, employee)).toThrow(
      ForbiddenException,
    );
    const view = libraryView(f.state, 9, employee),
      entry = view.entries.find((item) => item.definition.id === id)!;
    expect(entry.status).toBe('APPROVED');
    expect(entry.definition.meaning).toBe(fields.meaning);
    expect(JSON.stringify(view)).not.toContain('Private');
    expect(Object.values(entry.permissions)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(view.approvers).toEqual([]);
    expect(view.canEdit).toBe(false);
  });

  it('adapts examples with stable distinct identities, shared sequence and duplicate protection across drafts', () => {
    const f = fixture(),
      reference = structuredClone(f.state.definitions[0]);
    f.state.sequence = 73;
    const id = f.run('SAVE_DRAFT', undefined, {
      ...fields,
      kraId: '',
      kraName: 'Adapted quality',
      adaptedKraFromId: reference.kraId,
      adaptedFromId: reference.id,
      id: reference.id,
      code: reference.code,
      source: 'REFERENCE',
    });
    const draft = f.state.definitionLibrary!.records[0].draft;
    expect(draft).toMatchObject({
      id,
      code: 'KPI-0074',
      source: 'CUSTOM',
      adaptedFromId: reference.id,
    });
    expect(f.state.kras.find((kra) => kra.id === draft.kraId)).toMatchObject({
      code: 'KRA-0075',
      adaptedFromId: reference.kraId,
    });
    expect(f.state.definitions[0]).toEqual(reference);
    f.run('SAVE_DRAFT', id, { meaning: 'Changed safely' });
    expect(f.state.definitionLibrary!.records[0].draft.code).toBe('KPI-0074');
    expect(() =>
      f.run('SAVE_DRAFT', undefined, { ...fields, kraId: draft.kraId }),
    ).toThrow(ConflictException);
    expect(() =>
      assertUniqueLibraryDefinition(f.state, { ...draft, id: 'area03-new' }),
    ).toThrow(ConflictException);
    expect(() => f.run('SAVE_DRAFT', reference.id, fields)).toThrow(
      NotFoundException,
    );
  });

  it('records Area 03 definitions as drafts while preserving their existing identity', () => {
    const state = emptyPlanningState(),
      definition = {
        ...state.definitions[0],
        id: 'custom',
        code: 'KPI-0001',
        source: 'CUSTOM' as const,
      };
    state.definitions.push(definition);
    registerPlanningDefinitionDraft(state, definition, editor.actor, editor.at);
    expect(state.definitionLibrary!.records[0]).toMatchObject({
      definitionId: 'custom',
      status: 'DRAFT',
      draft: definition,
      versions: [],
      history: [{ actorId: 'hr', actorRole: 'HR', at: editor.at }],
    });
    expect(approvedPlanningLibrary(state, editor.today).definitions).toEqual(
      [],
    );
  });

  it('protects approval snapshots and audit history from older backup restore', () => {
    const f = fixture(),
      id = f.create();
    const oldBackup = structuredClone(f.state);
    f.approve(id);
    expect(() => assertLibraryHistoryPreserved(f.state, oldBackup)).toThrow(
      BadRequestException,
    );
    const missing = structuredClone(f.state);
    delete missing.definitionLibrary;
    expect(() => assertLibraryHistoryPreserved(f.state, missing)).toThrow(
      BadRequestException,
    );
    const changedDefinition = structuredClone(f.state);
    changedDefinition.definitions.find(
      (definition) => definition.id === id,
    )!.meaning = 'Overwrite';
    expect(() =>
      assertLibraryHistoryPreserved(f.state, changedDefinition),
    ).toThrow(BadRequestException);
    expect(() =>
      assertLibraryHistoryPreserved(f.state, structuredClone(f.state)),
    ).not.toThrow();
  });
});
