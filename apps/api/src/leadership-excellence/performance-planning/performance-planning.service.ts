import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { PlanningReferencesService } from './planning-references.service';
import { emptyPlanningState } from './planning.seed';
import {
  reserveDepartmentGoalNumbers,
  sameDepartmentGoalParent,
  validDepartmentGoalNumber,
} from './department-goal-number';
import {
  programmeCommitment,
  programmeItemIssues,
  programmeItemLocked,
  planningReadinessIssues,
  recordProgrammeResult,
  verifyProgrammeResult,
  reviewProgrammeResult,
} from './planning.programme';
import {
  approvedParentGoals,
  assertEdit,
  actionLinkIssues,
  blankData,
  cleanItem,
  cleanText,
  eligibleSources,
  findingReviewIssues,
  isCoordinator,
  isManager,
  itemList,
  MANAGEMENT,
  permissions,
  parentReferenceIssues,
  PILLAR_CODES,
  published,
  resolvePlanningPeriod,
  resolveApprovedParent,
  sanitizeForReader,
  strings,
  validDate,
  validateDefinition,
  validatePlan,
} from './planning.rules';
import type {
  ApprovedVersion,
  Finding,
  Goal,
  ParentGoal,
  ItemKind,
  KpiDefinition,
  PlanningActor,
  PlanningCommand,
  PlanningDocument,
  PlanningReferences,
  PlanningState,
  PlanningView,
  ActionLink,
  AuditEvent,
  Assignment,
  SharedAction,
  Objective,
  DeliveryAction,
} from './planning.types';

type Context = { references: PlanningReferences; actor: PlanningActor };
const organisationToday = (timeZone = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** Item IDs make the history stable when rows are reordered. */
function changesBetween(
  before: unknown,
  after: unknown,
  field = '',
): NonNullable<AuditEvent['changes']> {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const left = before && typeof before === 'object' ? before : null;
  const right = after && typeof after === 'object' ? after : null;
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : [],
      b = Array.isArray(right) ? right : [];
    if (
      [...a, ...b].every(
        (v) => v && typeof v === 'object' && typeof v.id === 'string',
      )
    ) {
      return [...new Set([...a, ...b].map((v) => v.id))].flatMap((id) => {
        const old = a.find((v) => v.id === id),
          next = b.find((v) => v.id === id);
        return changesBetween(
          old,
          next,
          `${field}[${next?.code || old?.code || id}]`,
        );
      });
    }
  } else if (left || right) {
    const a = (left || {}) as Record<string, unknown>,
      b = (right || {}) as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter(
        (k) =>
          ![
            'history',
            'versions',
            'updatedAt',
            'updatedBy',
            'createdAt',
            'createdBy',
          ].includes(k),
      )
      .flatMap((k) => changesBetween(a[k], b[k], field ? `${field}.${k}` : k));
  }
  return [{ field, before: before ?? null, after: after ?? null }];
}

@Injectable()
export class PerformancePlanningService {
  constructor(
    private readonly db: PrismaService,
    private readonly refs: PlanningReferencesService,
  ) {}
  private readState(value: unknown): PlanningState {
    const state = value as PlanningState;
    if (!state || state.schema !== 1 || !Array.isArray(state.documents))
      throw new ConflictException(
        'The planning data needs an updated application version.',
      );
    return structuredClone(state);
  }
  private useLibrary(state: PlanningState, references: PlanningReferences) {
    const library = references.library;
    if (!library) return state;
    const kras = new Map(state.kras.map((k) => [k.id, k]));
    const definitions = new Map(state.definitions.map((k) => [k.id, k]));
    for (const kra of library.kras) kras.set(kra.id, structuredClone(kra));
    for (const definition of library.definitions)
      definitions.set(definition.id, structuredClone(definition));
    state.kras = [...kras.values()];
    state.definitions = [...definitions.values()];
    return state;
  }
  private view(
    state: PlanningState,
    revision: number,
    context: Context,
  ): PlanningView {
    const today = organisationToday(context.references.timeZone);
    const documents = state.documents.flatMap((document) => {
      const visible = sanitizeForReader(document, context.actor, today);
      if (!visible) return [];
      const access = permissions(document, context.actor);
      // Source access depends on membership in each source assessment, not just a company-plan role.
      if (document.kind !== 'SWOT') {
        for (const data of [
          visible.data,
          ...visible.versions.map((v) => v.data),
        ]) {
          for (const objective of data.objectives) {
            const total = objective.sources.length;
            objective.sources = objective.sources.filter((s) => {
              const assessment = state.documents.find(
                (d) => d.id === s.documentId,
              );
              return (
                assessment && permissions(assessment, context.actor).canRead
              );
            });
            if (objective.sources.length < total)
              objective.sourceRationale = '';
          }
          for (const action of data.actions)
            action.sources = action.sources.filter((s) => {
              const assessment = state.documents.find(
                (d) => d.id === s.documentId,
              );
              return (
                assessment && permissions(assessment, context.actor).canRead
              );
            });
        }
      }
      // Historical source diffs must not bypass assessment access checks.
      if (document.kind !== 'SWOT' && !isManager(context.actor))
        for (const event of visible.history)
          if (event.changes)
            event.changes = event.changes.filter(
              (c) =>
                !/(?:^|\.)(sources|sourceRationale)(?:\.|\[|$)/.test(c.field),
            );
      return [
        {
          ...visible,
          permissions: access,
          programmeIssues:
            access.canEdit || access.canApprove
              ? Object.fromEntries(
                  (document.kind === 'COMPANY'
                    ? document.data.objectives
                    : document.kind === 'DEPARTMENT' ||
                        document.kind === 'INDIVIDUAL'
                      ? document.data.goals
                      : []
                  ).map((item) => [
                    item.id,
                    programmeItemIssues(
                      document,
                      document.kind === 'COMPANY' ? 'objective' : 'goal',
                      item.id,
                      state,
                      context.references,
                    ),
                  ]),
                )
              : {},
          issues:
            access.canEdit || access.canApprove
              ? planningReadinessIssues(
                  document,
                  state,
                  context.references,
                  today,
                )
              : [],
        },
      ];
    });
    const sharedActions: SharedAction[] = documents
      .filter((d) => d.kind === 'DEPARTMENT')
      .flatMap((d) =>
        d.versions
          .filter((v) => v.effectiveDate <= today)
          .flatMap((v) =>
            v.data.actions.map((action) => ({
              documentId: d.id,
              version: v.version,
              action,
            })),
          ),
      );
    // Saved individual parent links also expose eligible approved actions for
    // that exact goal/version, without opening the other department's plan.
    for (const document of documents)
      for (const data of [
        document.data,
        ...document.versions.map((v) => v.data),
      ]) {
        const links = [...(data.actionLinks || [])];
        if (document.kind === 'INDIVIDUAL')
          for (const goal of data.goals) {
            const parent = goal.parent;
            if (!parent) continue;
            const source = state.documents.find(
              (d) => d.id === parent.documentId,
            );
            const version = source?.versions.find(
              (v) => v.version === parent.version,
            );
            for (const action of version?.data.actions || [])
              if (action.goalId === parent.goalId)
                links.push({
                  id: '',
                  goalId: goal.id,
                  documentId: parent.documentId,
                  version: parent.version,
                  actionId: action.id,
                });
          }
        for (const link of links) {
          if (
            sharedActions.some(
              (a) =>
                a.documentId === link.documentId &&
                a.version === link.version &&
                a.action.id === link.actionId,
            )
          )
            continue;
          const source = state.documents.find(
            (d) =>
              d.id === link.documentId &&
              d.kind === 'DEPARTMENT' &&
              d.cycle === document.cycle,
          );
          const action = source?.versions
            .find((v) => v.version === link.version && v.effectiveDate <= today)
            ?.data.actions.find((a) => a.id === link.actionId);
          if (
            !action ||
            actionLinkIssues({ ...document, data }, link, state, today).length
          )
            continue;
          const safe = structuredClone(action);
          safe.sources = safe.sources.filter((s) => {
            const assessment = state.documents.find(
              (d) => d.id === s.documentId,
            );
            return assessment && permissions(assessment, context.actor).canRead;
          });
          sharedActions.push({
            documentId: source!.id,
            version: link.version,
            action: safe,
          });
        }
      }
    const permittedIds = new Set(documents.map((d) => d.id));
    const programmeActions = state.documents
      .filter((d) => permittedIds.has(d.id))
      .flatMap((document) =>
        document.data.actions
          .filter((action) => {
            if (document.kind === 'SWOT')
              return permissions(document, context.actor).canRead;
            if (
              permissions({ ...document, status: 'DRAFT' }, context.actor)
                .canEdit ||
              permissions(document, context.actor).canApprove
            )
              return true;
            return (
              !!action.parent &&
              document.versions.some(
                (v) =>
                  v.version === action.parent!.version &&
                  v.effectiveDate <= today &&
                  v.data.goals.some((g) => g.id === action.parent!.goalId),
              )
            );
          })
          .map((action) => ({
            documentId: document.id,
            action: {
              ...structuredClone(action),
              sources: isManager(context.actor) ? action.sources : [],
            },
          })),
      );
    const permittedActions = new Set(programmeActions.map((a) => a.action.id));
    const visibleCommitment = (entry: {
      documentId: string;
      itemId: string;
      version: number;
    }) => {
      const doc = documents.find((d) => d.id === entry.documentId);
      return !!doc?.versions.some(
        (v) =>
          v.version === entry.version &&
          (doc.kind === 'COMPANY' ? v.data.objectives : v.data.goals).some(
            (i) => i.id === entry.itemId,
          ),
      );
    };
    return {
      revision,
      programmeResults: (state.programmeResults || []).filter(
        visibleCommitment,
      ),
      programmeReviews: (state.programmeReviews || []).filter(
        visibleCommitment,
      ),
      programmeActionProgress: (state.programmeActionProgress || [])
        .filter((r) => permittedActions.has(r.actionId))
        .reverse(),
      programmeActions,
      ...context,
      documents,
      kras: state.kras,
      definitions: state.definitions,
      sharedActions,
      approvedParentGoals: approvedParentGoals(state, context.actor, today),
    };
  }
  async getWorkspace(user: AccessTokenPayload) {
    const [row, context] = await Promise.all([
      this.db.lexPlanningWorkspace.findUnique({
        where: { organizationId: user.organizationId },
      }),
      this.refs.get(user),
    ]);
    return this.view(
      this.useLibrary(
        row ? this.readState(row.state) : emptyPlanningState(),
        context.references,
      ),
      row?.revision || 0,
      context,
    );
  }
  private log(
    document: PlanningDocument,
    actor: PlanningActor,
    action: string,
    detail = '',
  ) {
    document.history.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      actorId: actor.userId,
      actorName: actor.name,
      action,
      detail,
    });
  }
  private reference(
    state: PlanningState,
    prefix: string,
    pillar = '',
    cycle = '',
  ) {
    state.sequence++;
    // Display compact years in new references; the full date range remains the
    // internal cycle key and the workspace sequence keeps every code unique.
    const range = /^(\d{4})-\d{2}-\d{2}\.\.(\d{4})-\d{2}-\d{2}$/.exec(cycle);
    const periodCode = range
      ? range[1] === range[2]
        ? range[1]
        : `${range[1]}-${range[2]}`
      : cycle;
    return [prefix, pillar, periodCode, String(state.sequence).padStart(4, '0')]
      .filter(Boolean)
      .join('-');
  }
  private createPlan(
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    const kind = cleanText(payload.kind) as PlanningDocument['kind'],
      scope = cleanText(payload.scopeId, 200);
    const { cycle, startDate, endDate } = resolvePlanningPeriod(payload);
    if (
      ![
        'SWOT',
        'COMPANY',
        'DEPARTMENT',
        'TEAM',
        'POSITION',
        'INDIVIDUAL',
      ].includes(kind)
    )
      throw new BadRequestException('Select a valid plan type.');
    const { actor, references } = context;
    let departmentId = '';
    if (kind === 'DEPARTMENT') {
      departmentId = scope;
      if (!references.departments.some((d) => d.id === scope))
        throw new BadRequestException('Select an EMS department.');
    }
    if (kind === 'INDIVIDUAL') {
      const employee = references.people.find((p) => p.id === scope);
      if (!employee) throw new BadRequestException('Select an EMS employee.');
      departmentId = employee.departmentId || '';
    }
    if (kind === 'TEAM') {
      const team = references.teams.find((t) => t.id === scope);
      if (!team) throw new BadRequestException('Select an EMS team/section.');
      departmentId = team.departmentId;
    }
    if (kind === 'POSITION') {
      const position = references.positions?.find((p) => p.id === scope);
      if (!position)
        throw new BadRequestException(
          'Select an existing EMS position. Position master data must be supplied by Organisation & Performance Framework.',
        );
      departmentId = position.departmentId;
    }
    const scopeId = ['SWOT', 'COMPANY'].includes(kind) ? 'COMPANY' : scope;
    if (
      ['SWOT', 'COMPANY'].includes(kind)
        ? !isCoordinator(actor)
        : !isCoordinator(actor) &&
          !(actor.role === 'HOD' && departmentId === actor.departmentId) &&
          !(kind === 'INDIVIDUAL' && scope === actor.employeeId)
    )
      throw new ForbiddenException('You cannot create a plan for this scope.');
    if (
      state.documents.some(
        (d) => d.kind === kind && d.scopeId === scopeId && d.cycle === cycle,
      )
    )
      throw new ConflictException(
        'This scope already has a plan for this planning period. Open its existing plan.',
      );
    // Keep the real EMS scope, but do not require another planning record just
    // to save a draft. Team/position department plans are checked at finalisation;
    // an individual may contribute to an authorised plan in another department.
    if (
      ['TEAM', 'POSITION', 'INDIVIDUAL'].includes(kind) &&
      !references.departments.some((d) => d.id === departmentId)
    )
      throw new BadRequestException(
        'This EMS employee, team or position needs a valid department assignment.',
      );
    const data = blankData();
    data.title =
      cleanText(payload.title, 350) ||
      `${kind === 'SWOT' ? 'Company SWOT' : kind === 'COMPANY' ? 'Company plan' : references.departments.find((d) => d.id === scope)?.name || references.people.find((p) => p.id === scope)?.name || references.teams.find((t) => t.id === scope)?.name} · ${cycle}`;
    data.ownerId = actor.employeeId;
    data.approverId = isManager(actor) ? actor.employeeId : '';
    data.startDate = startDate;
    data.endDate = endDate;
    if (kind === 'TEAM')
      data.contributorIds = references.teams.find(
        (t) => t.id === scope,
      )!.memberIds;
    const document: PlanningDocument = {
      // Position holders are preserved with each approved plan; future EMS
      // transfers do not silently rewrite earlier responsibilities.
      id: randomUUID(),
      code: this.reference(state, kind === 'SWOT' ? 'SWOT' : 'PLAN', '', cycle),
      kind,
      scopeId,
      departmentId,
      cycle,
      status: 'DRAFT',
      data,
      versions: [],
      revisionReason: '',
      effectiveDate: '',
      history: [],
      acknowledgement: null,
    };
    if (kind === 'POSITION') {
      const position = references.positions!.find((p) => p.id === scope)!;
      data.title =
        cleanText(payload.title, 350) || `${position.name} · ${cycle}`;
      data.contributorIds = [...position.holderIds];
    }
    this.log(document, actor, 'Created draft plan');
    state.documents.push(document);
    return document.id;
  }
  private settings(
    document: PlanningDocument,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    assertEdit(document, context.actor);
    const canConfigure = permissions(document, context.actor).canConfigure;
    for (const key of ['title', 'ownerId', 'startDate', 'endDate'] as const)
      if (key in payload) {
        const value = cleanText(payload[key], key === 'title' ? 350 : 100);
        if (
          key === 'ownerId' &&
          document.kind === 'SWOT' &&
          value !== document.data.ownerId &&
          !canConfigure
        )
          throw new ForbiddenException(
            'Only management can reassign confidential assessment ownership.',
          );
        if (
          key === 'ownerId' &&
          value &&
          !context.references.people.some((p) => p.id === value)
        )
          throw new BadRequestException(
            'Select an owner from this organisation.',
          );
        if (
          (key === 'startDate' || key === 'endDate') &&
          value &&
          !validDate(value)
        )
          throw new BadRequestException('Enter valid planning dates.');
        document.data[key] = value;
      }
    if (
      document.cycle.includes('..') &&
      ('startDate' in payload || 'endDate' in payload)
    ) {
      const period = resolvePlanningPeriod({ cycle: document.cycle });
      const { startDate, endDate } = document.data;
      if (
        (startDate && startDate < period.startDate) ||
        (endDate && endDate > period.endDate) ||
        (startDate && endDate && startDate > endDate)
      )
        throw new BadRequestException(
          'Plan dates must stay within the selected planning period.',
        );
    }
    for (const key of [
      'approverId',
      'coordinatorIds',
      'contributorIds',
    ] as const)
      if (key in payload) {
        if (!canConfigure)
          throw new ForbiddenException(
            'Only management or the relevant HOD can change plan access and the approver.',
          );
        if (key === 'approverId') {
          const id = cleanText(payload[key], 100);
          if (id && !context.references.people.some((p) => p.id === id))
            throw new BadRequestException('Select an approver from EMS.');
          document.data.approverId = id;
        } else {
          const ids = strings(payload[key]);
          const changedMembers =
            key === 'contributorIds' &&
            JSON.stringify([...ids].sort()) !==
              JSON.stringify([...document.data.contributorIds].sort());
          if (
            (key !== 'contributorIds' || changedMembers) &&
            ids.some(
              (id) => !context.references.people.some((p) => p.id === id),
            )
          )
            throw new BadRequestException('Select contributors from EMS.');
          if (
            key === 'contributorIds' &&
            ['TEAM', 'POSITION'].includes(document.kind) &&
            changedMembers
          ) {
            const members =
              document.kind === 'TEAM'
                ? context.references.teams.find(
                    (t) => t.id === document.scopeId,
                  )?.memberIds
                : context.references.positions?.find(
                    (p) => p.id === document.scopeId,
                  )?.holderIds;
            if (!members || ids.some((id) => !members.includes(id)))
              throw new BadRequestException(
                'Use current EMS members for this team or position. Earlier approved assignments remain in history.',
              );
          }
          document.data[key] = ids;
        }
      }
    document.acknowledgement = null;
    this.log(document, context.actor, 'Plan settings updated');
  }
  private saveItem(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    const kind = cleanText(payload.kind) as ItemKind;
    if (kind === 'action')
      assertEdit({ ...document, status: 'DRAFT' }, context.actor);
    else assertEdit(document, context.actor);
    if (
      !['finding', 'objective', 'goal', 'assignment', 'action'].includes(kind)
    )
      throw new BadRequestException('Unknown planning item.');
    if (
      document.kind === 'SWOT'
        ? !['finding', 'action'].includes(kind)
        : kind === 'finding' ||
          (kind === 'objective' && document.kind !== 'COMPANY') ||
          (document.kind === 'COMPANY' &&
            ['assignment', 'action'].includes(kind))
    )
      throw new BadRequestException(
        'This item belongs in a different planning component.',
      );
    const id = cleanText(payload.id, 100),
      list = document.data[itemList(kind)] as unknown as Record<
        string,
        unknown
      >[];
    const old = id ? list.find((item) => item.id === id) : undefined;
    if (
      kind === 'assignment' &&
      old?.goalId &&
      programmeItemLocked(document, 'goal', String(old.goalId))
    )
      throw new ConflictException(
        'This KPI belongs to an approved commitment. Open a dated goal revision before editing it.',
      );
    if (
      id &&
      ['objective', 'goal'].includes(kind) &&
      programmeItemLocked(document, kind, id)
    )
      throw new ConflictException(
        'This approved commitment is locked. Open a dated revision before editing.',
      );
    if (id && !old)
      throw new NotFoundException('The item does not belong to this plan.');
    if (
      !payload.data ||
      typeof payload.data !== 'object' ||
      Array.isArray(payload.data)
    )
      throw new BadRequestException('Invalid planning fields.');
    const itemInput = { ...(payload.data as Record<string, unknown>) };
    if (kind === 'goal' && document.kind === 'DEPARTMENT') {
      // These fields are owned by the server, including for older API clients.
      itemInput.goalNo = validDepartmentGoalNumber(old?.goalNo)
        ? old.goalNo
        : null;
      itemInput.departmentCode = old?.departmentCode || '';
    }
    const oldCalendar =
      kind === 'assignment'
        ? (old as unknown as Assignment | undefined)?.calendar
        : undefined;
    const itemReferences =
      oldCalendar && itemInput.useCurrentCalendar !== true
        ? { ...context.references, calendar: oldCalendar }
        : context.references;
    if (kind === 'finding' && old?.reviewStatus === 'REVIEWED')
      throw new ConflictException(
        'This finding is reviewed and locked. Reopen it with a reason before editing.',
      );
    const data = cleanItem(kind, itemInput, itemReferences);
    if (
      kind === 'assignment' &&
      data.goalId &&
      programmeItemLocked(document, 'goal', String(data.goalId))
    )
      throw new ConflictException(
        'This KPI belongs to an approved commitment. Open a dated goal revision before adding or editing it.',
      );
    if (
      ['objective', 'goal'].includes(kind) &&
      data.direction &&
      !data.startDate
    )
      data.startDate = document.data.startDate;
    if (kind === 'action')
      this.validateProgrammeAction(
        document,
        state,
        data,
        context,
        old as unknown as DeliveryAction | undefined,
      );
    if (kind === 'goal' && document.kind === 'DEPARTMENT') {
      const oldParent = (old as unknown as Goal | undefined)?.parent;
      const newParent = data.parent as ParentGoal | null;
      const sameParent = sameDepartmentGoalParent(oldParent, newParent);
      const previouslyApproved =
        old &&
        document.versions.some(
          (version) =>
            (!version.approvedItem ||
              (version.approvedItem.kind === 'goal' &&
                version.approvedItem.itemId === id)) &&
            version.data.goals.some((goal) => goal.id === id),
        );
      const parentChanged =
        !!oldParent !== !!newParent ||
        (!!oldParent && !!newParent && !sameParent);
      if (previouslyApproved && parentChanged)
        throw new ConflictException(
          'An approved goal keeps its parent and generated code. Create a separate contribution for another parent.',
        );
      // Keep the old scope's high-water mark even if an unapproved draft changes parent.
      if (oldParent) reserveDepartmentGoalNumbers(state, document, oldParent);
      const parent = newParent && resolveApprovedParent(state, newParent);
      const department = context.references.departments.find(
        (d) => d.id === document.scopeId,
      );
      const departmentCode = String(
        old?.departmentCode ||
          (department as { code?: string } | undefined)?.code ||
          (department?.name || 'DEPT')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 8) +
            '-' +
            document.scopeId
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(-6)
              .toUpperCase(),
      );
      data.departmentCode = departmentCode;
      if (parent && newParent) {
        const scope = reserveDepartmentGoalNumbers(state, document, newParent);
        const priorNumber = old?.goalNo;
        const priorCodeMatches =
          validDepartmentGoalNumber(priorNumber) &&
          old?.code ===
            `${parent.goal.code}-${departmentCode}-G${String(priorNumber).padStart(2, '0')}`;
        const unboundLegacyNumber =
          !oldParent && String(old?.code || '').startsWith('GOAL-');
        const numberTaken =
          validDepartmentGoalNumber(priorNumber) &&
          [...(scope.used.get(priorNumber) || [])].some(
            (owner) => owner !== id,
          );
        if (sameParent && numberTaken)
          throw new ConflictException(
            'This saved goal number conflicts with another contribution. Resolve the duplicate before saving.',
          );
        const retain =
          validDepartmentGoalNumber(priorNumber) &&
          (sameParent || priorCodeMatches || unboundLegacyNumber) &&
          !numberTaken;
        if (previouslyApproved && !retain)
          throw new ConflictException(
            'The approved goal identity conflicts with another record. Keep its existing number and resolve the duplicate before saving.',
          );
        const number = retain ? priorNumber : scope.high + 1;
        if (!validDepartmentGoalNumber(number))
          throw new ConflictException(
            'No further goal numbers can be allocated for this parent.',
          );
        state.departmentGoalSequences![scope.key] = Math.max(
          scope.high,
          number,
        );
        data.goalNo = number;
        data.businessCode =
          retain && sameParent && old?.code
            ? old.code
            : `${parent.goal.code}-${departmentCode}-G${String(number).padStart(2, '0')}`;
        if (
          document.data.goals.some(
            (goal) => goal.id !== id && goal.code === data.businessCode,
          )
        )
          throw new ConflictException(
            'This generated goal code conflicts with another contribution. Resolve the duplicate before saving.',
          );
      }
    }
    if (kind === 'finding') {
      data.reviewStatus =
        data.basis === 'NEEDS_CHECKING' || data.response === 'VERIFY'
          ? 'NEEDS_EVIDENCE'
          : 'UNDER_REVIEW';
      data.reviewedAt = '';
      data.reviewedBy = '';
    }
    if (
      kind === 'finding' &&
      list.some(
        (f) =>
          f.id !== id &&
          f.pillar === data.pillar &&
          f.category === data.category &&
          String(f.title).toLowerCase().replace(/\s+/g, ' ') ===
            String(data.title).toLowerCase().replace(/\s+/g, ' '),
      )
    )
      throw new ConflictException(
        'This finding already exists in the same pillar and category. Use related pillars for shared issues.',
      );
    if (kind === 'goal') {
      if (
        document.kind === 'COMPANY' &&
        !document.data.objectives.some((o) => o.id === data.objectiveId)
      )
        throw new BadRequestException(
          'Select exactly one objective in this company plan.',
        );
      if (
        old &&
        document.kind === 'COMPANY' &&
        old.objectiveId !== data.objectiveId
      )
        throw new BadRequestException(
          'A company goal cannot be moved to another objective.',
        );
      if (data.parent) {
        const issues = parentReferenceIssues(
          document,
          data.parent as ParentGoal,
          state,
          context.actor,
          (old as unknown as Goal | undefined)?.parent,
        );
        if (issues.length) throw new BadRequestException(issues[0]);
      }
    }
    if (
      ['assignment', 'action'].includes(kind) &&
      data.goalId &&
      !document.data.goals.some((g) => g.id === data.goalId)
    )
      throw new BadRequestException('Select a goal in this plan.');
    if (
      data.definitionId &&
      !state.definitions.some((d) => d.id === data.definitionId)
    )
      throw new BadRequestException('Choose an existing KPI definition.');
    if (data.sources)
      for (const source of data.sources as {
        documentId: string;
        findingId: string;
        version: number;
      }[]) {
        const assessment = state.documents.find(
          (d) =>
            d.id === source.documentId &&
            d.kind === 'SWOT' &&
            d.cycle === document.cycle,
        );
        if (!assessment || !permissions(assessment, context.actor).canRead)
          throw new ForbiddenException(
            'You cannot use sources from this SWOT assessment.',
          );
        if (
          !eligibleSources(state).some(
            (s) =>
              s.documentId === source.documentId &&
              s.findingId === source.findingId &&
              s.version === source.version,
          )
        )
          throw new BadRequestException(
            'Select a reviewed finding whose basis is confirmed.',
          );
      }
    // Preserve existing references hidden by the source assessment's access rules.
    if (old && (kind === 'objective' || kind === 'action')) {
      const hidden = (
        (old.sources || []) as {
          documentId: string;
          findingId: string;
          version: number;
        }[]
      ).filter((source) => {
        const assessment = state.documents.find(
          (d) => d.id === source.documentId,
        );
        return assessment && !permissions(assessment, context.actor).canRead;
      });
      data.sources = [...(data.sources as object[]), ...hidden];
      if (kind === 'objective' && hidden.length && !data.sourceRationale)
        data.sourceRationale = old.sourceRationale;
    }
    if (kind === 'action' && data.parentActionId) {
      let parent = document.data.actions.find(
        (a) => a.id === data.parentActionId,
      );
      const seen = new Set([id]);
      if (!parent)
        throw new BadRequestException('Select a parent action in this plan.');
      if (parent.goalId !== data.goalId)
        throw new BadRequestException(
          'A sub-action must support the same contribution goal as its parent.',
        );
      while (parent) {
        if (seen.has(parent.id))
          throw new BadRequestException(
            'An action cannot be its own ancestor.',
          );
        seen.add(parent.id);
        parent = document.data.actions.find(
          (a) => a.id === parent!.parentActionId,
        );
      }
    }
    // Reviewed findings may support multiple objectives. Each objective keeps
    // its own version-pinned references; cleanItem rejects duplicate references
    // within this objective and the checks above enforce review/access/scope.
    const businessCode =
      typeof data.businessCode === 'string' ? data.businessCode : '';
    delete data.businessCode;
    const at = new Date().toISOString(),
      item = {
        ...data,
        id: old?.id || randomUUID(),
        code:
          businessCode ||
          old?.code ||
          (kind === 'objective' && !data.pillar
            ? ''
            : this.reference(
                state,
                {
                  finding: 'SWOT',
                  objective: 'OBJ',
                  goal: 'GOAL',
                  assignment: 'KPIA',
                  action: 'ACT',
                }[kind],
                String(data.pillar || ''),
                document.cycle,
              )),
        createdAt: old?.createdAt || at,
        createdBy: old?.createdBy || context.actor.userId,
        updatedAt: at,
        updatedBy: context.actor.userId,
      };
    if (old) list[list.indexOf(old)] = item;
    else list.push(item);
    if (kind === 'finding') {
      const affected = new Set([
        data.pillar,
        ...(data.relatedPillars as string[]),
        old?.pillar,
        ...((old?.relatedPillars as string[]) || []),
      ]);
      document.data.consideredPillars = document.data.consideredPillars.filter(
        (p) => !affected.has(p),
      );
    }
    document.acknowledgement = null;
    this.log(
      document,
      context.actor,
      old ? 'Updated draft item' : 'Created draft item',
      String(item.code),
    );
    return String(item.id);
  }
  private validateProgrammeAction(
    document: PlanningDocument,
    state: PlanningState,
    data: Record<string, unknown>,
    context: Context,
    old?: DeliveryAction,
  ) {
    if (
      old &&
      state.programmeActionProgress?.some((p) => p.actionId === old.id)
    )
      throw new ConflictException(
        'An action with progress is retained for history. Add a follow-up action instead of rewriting its commitment.',
      );
    if (data.goalId && !data.parent) {
      const version = [...document.versions]
        .reverse()
        .find(
          (v) =>
            (!v.approvedItem || v.approvedItem.itemId === data.goalId) &&
            v.data.goals.some((g) => g.id === data.goalId),
        );
      if (version)
        data.parent = {
          documentId: document.id,
          goalId: String(data.goalId),
          version: version.version,
          itemKind: 'GOAL',
        };
    }
    if (data.parent) {
      const parent = data.parent as ParentGoal;
      const source = state.documents.find((d) => d.id === parent.documentId);
      if (!source || source.id !== document.id || source.kind !== 'DEPARTMENT')
        throw new BadRequestException(
          'Choose an approved contribution in this department plan.',
        );
      const { item } = programmeCommitment(
        source,
        parent.goalId,
        parent.version,
      );
      if (data.goalId !== item.id)
        throw new BadRequestException(
          'The action must support its selected approved contribution.',
        );
      if (data.dueDate && String(data.dueDate) > item.endDate)
        throw new BadRequestException(
          'The action due date must not exceed the contribution due date.',
        );
    }
    const sources = (data.sources || []) as DeliveryAction['sources'];
    const directFinding = !data.goalId && !data.parent && sources.length > 0;
    if (document.kind === 'SWOT' || directFinding) {
      if (
        data.goalId ||
        data.parent ||
        sources.length !== 1 ||
        (document.kind === 'SWOT' && sources[0].documentId !== document.id)
      )
        throw new BadRequestException(
          'Link this direct action to one reviewed finding in this assessment.',
        );
      const finding = eligibleSources(state).find(
        (s) =>
          s.documentId === sources[0].documentId &&
          s.findingId === sources[0].findingId &&
          s.version === sources[0].version,
      );
      if (!finding || finding.finding.response !== 'ACTION')
        throw new BadRequestException(
          'Review the finding before creating its department action.',
        );
    }
    if (data.parent || document.kind === 'SWOT' || directFinding) {
      if (
        !data.title ||
        !data.ownerId ||
        !validDate(String(data.dueDate)) ||
        !data.expectedResult ||
        !data.completionEvidence
      )
        throw new BadRequestException(
          'Enter the action, owner, due date, expected result and completion check.',
        );
      if (
        String(data.dueDate) < document.data.startDate ||
        String(data.dueDate) > document.data.endDate
      )
        throw new BadRequestException(
          'Keep the action due date within the planning period.',
        );
    }
  }
  private approveProgrammeItem(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
    today: string,
  ) {
    const kind = payload.kind as 'objective' | 'goal',
      id = cleanText(payload.id, 100);
    if (!permissions(document, context.actor).canApprove)
      throw new ForbiddenException(
        'Only the designated approver can approve this commitment.',
      );
    if (
      !(
        (document.kind === 'COMPANY' && kind === 'objective') ||
        (document.kind === 'DEPARTMENT' && kind === 'goal')
      )
    )
      throw new BadRequestException(
        'Approve a company objective or department contribution.',
      );
    if (programmeItemLocked(document, kind, id))
      throw new ConflictException(
        'This commitment is already approved. Open a revision to change it.',
      );
    if (payload.evidenceChecked !== true)
      throw new BadRequestException(
        'Confirm that you checked the evidence and measurement rules.',
      );
    const issues = programmeItemIssues(
      document,
      kind,
      id,
      state,
      context.references,
    );
    if (issues.length) throw new BadRequestException({ message: issues });
    const key = kind === 'objective' ? 'objectives' : 'goals';
    const item = document.data[key].find((i) => i.id === id)!;
    const latest = document.versions.at(-1);
    // Start from the last approved contents, never from other current drafts.
    const data = structuredClone(
      latest?.data || {
        ...document.data,
        objectives: [],
        goals: [],
        assignments: [],
        actions: [],
        actionLinks: [],
      },
    );
    data.title = document.data.title;
    data.approverId = document.data.approverId;
    data.ownerId = document.data.ownerId;
    data.startDate = document.data.startDate;
    data.endDate = document.data.endDate;
    const rows = data[key] as (Objective | Goal)[];
    const index = rows.findIndex((i) => i.id === id);
    if (index >= 0) rows[index] = structuredClone(item);
    else rows.push(structuredClone(item));
    if (document.kind === 'COMPANY') data.goals = [];
    if (kind === 'goal') {
      data.assignments = [
        ...data.assignments.filter((assignment) => assignment.goalId !== id),
        ...structuredClone(
          document.data.assignments.filter(
            (assignment) => assignment.goalId === id,
          ),
        ),
      ];
    }
    const previous = document.itemApprovals?.find(
      (a) => a.itemId === id && a.kind === kind,
    );
    const at = new Date().toISOString();
    const snapshot: ApprovedVersion = {
      approvedItem: { kind, itemId: id },
      ...(document.kind === 'COMPANY'
        ? {
            companyPlanningModel: 'MEASURABLE_OBJECTIVES' as const,
            ...(document.data.goals.length
              ? { legacyCompanyGoals: structuredClone(document.data.goals) }
              : {}),
          }
        : {}),
      version:
        Math.max(
          0,
          ...document.versions.map((v) => v.version),
          ...(document.findingReviews || []).map((v) => v.version),
        ) + 1,
      data,
      approvedAt: at,
      approvedBy: context.actor.userId,
      effectiveDate: previous?.effectiveDate || today,
      definitions: structuredClone([
        ...(latest?.definitions || []).filter(
          (definition) =>
            !document.data.assignments.some(
              (assignment) =>
                kind === 'goal' &&
                assignment.goalId === id &&
                assignment.definitionId === definition.id,
            ),
        ),
        ...state.definitions.filter((definition) =>
          document.data.assignments.some(
            (assignment) =>
              kind === 'goal' &&
              assignment.goalId === id &&
              assignment.definitionId === definition.id,
          ),
        ),
      ]),
      reason: previous?.reason || '',
    };
    document.versions.push(snapshot);
    document.itemApprovals ||= [];
    document.itemApprovals = document.itemApprovals.filter(
      (a) => !(a.kind === kind && a.itemId === id),
    );
    document.itemApprovals.push({
      kind,
      itemId: id,
      status: 'APPROVED',
      version: snapshot.version,
      approvedAt: at,
      approvedBy: context.actor.userId,
      effectiveDate: snapshot.effectiveDate,
      reason: snapshot.reason,
    });
    document.status = 'DRAFT';
    document.planningModel = 'PROGRAMME';
    this.log(
      document,
      context.actor,
      'Approved and locked commitment',
      `${item.code} · version ${snapshot.version}`,
    );
    return id;
  }
  private reviseProgrammeItem(
    document: PlanningDocument,
    payload: Record<string, unknown>,
    context: Context,
    today: string,
  ) {
    const kind = payload.kind as 'objective' | 'goal',
      id = cleanText(payload.id, 100);
    if (!permissions(document, context.actor).canApprove)
      throw new ForbiddenException(
        'Only the designated approver may open a revision.',
      );
    if (!['objective', 'goal'].includes(kind))
      throw new BadRequestException('Select a commitment to revise.');
    const snapshot = [...document.versions]
      .reverse()
      .find((v) =>
        (kind === 'objective' ? v.data.objectives : v.data.goals).some(
          (i) => i.id === id,
        ),
      );
    if (!snapshot || !programmeItemLocked(document, kind, id))
      throw new ConflictException('Select an approved and locked commitment.');
    const reason = cleanText(payload.reason),
      effectiveDate = cleanText(payload.effectiveDate, 10);
    if (!reason || !validDate(effectiveDate) || effectiveDate < today)
      throw new BadRequestException(
        'Enter a revision reason and an effective date of today or later.',
      );
    document.itemApprovals ||= [];
    const approval = document.itemApprovals.find(
      (a) => a.kind === kind && a.itemId === id,
    );
    if (approval) {
      approval.status = 'DRAFT';
      approval.reason = reason;
      approval.effectiveDate = effectiveDate;
    } else
      document.itemApprovals.push({
        kind,
        itemId: id,
        status: 'DRAFT',
        version: snapshot.version,
        approvedAt: snapshot.approvedAt,
        approvedBy: snapshot.approvedBy,
        reason,
        effectiveDate,
      });
    // Migrating a legacy whole-plan approval must keep all other rows locked.
    if (document.status === 'APPROVED')
      for (const row of kind === 'objective'
        ? document.data.objectives
        : document.data.goals)
        if (
          row.id !== id &&
          !document.itemApprovals.some((a) => a.itemId === row.id)
        )
          document.itemApprovals.push({
            kind,
            itemId: row.id,
            status: 'APPROVED',
            version: snapshot.version,
            approvedAt: snapshot.approvedAt,
            approvedBy: snapshot.approvedBy,
          });
    document.status = 'DRAFT';
    this.log(document, context.actor, 'Opened commitment revision', reason);
    return id;
  }
  private saveGoals(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    assertEdit(document, context.actor);
    if (document.kind !== 'INDIVIDUAL')
      throw new BadRequestException(
        'This batch belongs to an individual plan.',
      );
    if (!Array.isArray(payload.goals) || payload.goals.length > 50)
      throw new BadRequestException(
        'Save at most 50 separate contribution blocks.',
      );
    const removed = strings(payload.removedIds || []),
      seen = new Set<string>(),
      assignmentIds = new Set<string>();
    if (removed.length > 50)
      throw new BadRequestException(
        'Remove at most 50 contribution blocks at once.',
      );
    const ids = payload.goals.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new BadRequestException(
          'Each contribution needs its own fields.',
        );
      const row = raw as Record<string, unknown>,
        id = cleanText(row.id, 100);
      if (id && (seen.has(id) || removed.includes(id)))
        throw new BadRequestException(
          'A contribution cannot appear twice or be saved and removed together.',
        );
      if (id) seen.add(id);
      const goalId = this.saveItem(
        document,
        state,
        { kind: 'goal', id, data: row.data },
        context,
      );
      const removals =
        row.removedAssignmentIds === undefined ? [] : row.removedAssignmentIds;
      if (
        !Array.isArray(removals) ||
        removals.length > 50 ||
        removals.some((value) => typeof value !== 'string')
      )
        throw new BadRequestException(
          'Select at most 50 KPI assignments to remove from this contribution.',
        );
      const removedAssignmentIds = removals.map((value) =>
        cleanText(value, 100),
      );
      if (
        row.assignments !== undefined &&
        (!Array.isArray(row.assignments) || row.assignments.length > 50)
      )
        throw new BadRequestException(
          'Save at most 50 KPI assignments per contribution.',
        );
      const checkAssignmentId = (assignmentId: string) => {
        if (!assignmentId || assignmentIds.has(assignmentId))
          throw new BadRequestException(
            'A KPI assignment cannot appear twice or be saved and removed together.',
          );
        assignmentIds.add(assignmentId);
        const existing = document.data.assignments.find(
          (assignment) => assignment.id === assignmentId,
        );
        if (!existing || existing.goalId !== goalId)
          throw new BadRequestException(
            'This KPI assignment does not belong to this contribution.',
          );
      };
      for (const rawAssignment of (row.assignments || []) as unknown[]) {
        if (
          !rawAssignment ||
          typeof rawAssignment !== 'object' ||
          Array.isArray(rawAssignment)
        )
          throw new BadRequestException(
            'Each KPI assignment needs its own fields.',
          );
        const assignment = rawAssignment as Record<string, unknown>;
        const assignmentId = cleanText(assignment.id, 100);
        if (assignmentId) checkAssignmentId(assignmentId);
        if (
          !assignment.data ||
          typeof assignment.data !== 'object' ||
          Array.isArray(assignment.data)
        )
          throw new BadRequestException('Invalid KPI assignment fields.');
        this.saveItem(
          document,
          state,
          {
            kind: 'assignment',
            id: assignmentId,
            data: { ...(assignment.data as Record<string, unknown>), goalId },
          },
          context,
        );
      }
      for (const assignmentId of removedAssignmentIds) {
        checkAssignmentId(assignmentId);
        this.deleteItem(
          document,
          state,
          { kind: 'assignment', id: assignmentId },
          context.actor,
        );
      }
      return goalId;
    });
    for (const id of removed)
      this.deleteItem(document, state, { kind: 'goal', id }, context.actor);
    document.planningModel = 'PROGRAMME';
    return ids;
  }
  private updateProgrammeAction(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    const action = document.data.actions.find((a) => a.id === payload.actionId);
    if (!action) throw new NotFoundException('Action not found in this plan.');
    if (
      !permissions({ ...document, status: 'DRAFT' }, context.actor).canEdit &&
      action.ownerId !== context.actor.employeeId
    )
      throw new ForbiddenException(
        'Only the action owner or authorised planner can record progress.',
      );
    if (!action.parent && document.kind !== 'SWOT' && !action.sources.length)
      throw new BadRequestException(
        'Link this action to an approved contribution before recording progress.',
      );
    const status = cleanText(payload.status),
      evidence = cleanText(payload.evidence),
      note = cleanText(payload.note);
    if (!['PLANNED', 'IN_PROGRESS', 'COMPLETED'].includes(status))
      throw new BadRequestException('Choose a valid action status.');
    if (status === 'COMPLETED' && !evidence)
      throw new BadRequestException(
        'Provide the completion evidence before completing the action.',
      );
    const id = randomUUID();
    (state.programmeActionProgress ||= []).push({
      id,
      documentId: document.id,
      actionId: action.id,
      status: status as 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED',
      evidence,
      note,
      updatedBy: context.actor.userId,
      updatedAt: new Date().toISOString(),
    });
    this.log(
      document,
      context.actor,
      'Recorded action progress',
      `${action.code}: ${status}`,
    );
    return id;
  }
  private saveFindings(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ): string[] {
    assertEdit(document, context.actor);
    if (document.kind !== 'SWOT')
      throw new BadRequestException('Findings belong in a SWOT assessment.');
    if (
      !Array.isArray(payload.findings) ||
      !payload.findings.length ||
      payload.findings.length > 50
    )
      throw new BadRequestException(
        'Add between 1 and 50 separate finding blocks.',
      );
    const ids = new Set<string>();
    return payload.findings.map((input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new BadRequestException(
          'Each finding must be a separate set of fields.',
        );
      const row = input as Record<string, unknown>,
        id = cleanText(row.id, 100);
      if (id && ids.has(id))
        throw new BadRequestException(
          'The same finding appears twice in this save.',
        );
      if (id) ids.add(id);
      return this.saveItem(
        document,
        state,
        { kind: 'finding', id, data: row },
        context,
      );
    });
  }
  private reviewFinding(
    document: PlanningDocument,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    if (document.kind !== 'SWOT' || document.status === 'APPROVED')
      throw new BadRequestException(
        'Open a draft SWOT assessment to review a finding.',
      );
    const finding = document.data.findings.find((f) => f.id === payload.id);
    if (!finding)
      throw new NotFoundException('Finding not found in this assessment.');
    if (finding.reviewStatus === 'REVIEWED')
      throw new ConflictException(
        'This finding is already reviewed. Reopen it with a reason before changing its decision.',
      );
    const status = payload.status;
    if (
      !['NEEDS_EVIDENCE', 'REVIEWED', 'UNDER_REVIEW'].includes(String(status))
    )
      throw new BadRequestException('Choose a valid finding review status.');
    if (status === 'REVIEWED') {
      if (!permissions(document, context.actor).canApprove)
        throw new ForbiddenException(
          'Only the designated approver can mark a finding reviewed.',
        );
    } else assertEdit(document, context.actor);
    const updates: Record<string, unknown> = { ...finding };
    for (const key of [
      'response',
      'decisionNote',
      'followupOwnerId',
      'reviewDate',
    ])
      if (key in payload) updates[key] = payload[key];
    const cleaned = cleanItem('finding', updates, context.references);
    const next = {
      ...finding,
      ...cleaned,
      reviewStatus: status,
      updatedBy: context.actor.userId,
      updatedAt: new Date().toISOString(),
    } as Finding;
    if (status === 'REVIEWED') {
      const issues = findingReviewIssues(next, context.references);
      if (payload.evidenceChecked !== true)
        issues.push(
          'Confirm that you have checked the supporting facts and evidence.',
        );
      if (issues.length) throw new BadRequestException({ message: issues });
      next.reviewedAt = next.updatedAt;
      next.reviewedBy = context.actor.userId;
      const version =
        Math.max(
          0,
          ...document.versions.map((v) => v.version),
          ...(document.findingReviews || []).map((v) => v.version),
        ) + 1;
      document.findingReviews = [
        ...(document.findingReviews || []),
        {
          version,
          finding: structuredClone(next),
          reviewedAt: next.reviewedAt,
          reviewedBy: next.reviewedBy,
        },
      ];
    } else {
      next.reviewedAt = '';
      next.reviewedBy = '';
    }
    document.data.findings[document.data.findings.indexOf(finding)] = next;
    document.acknowledgement = null;
    this.log(
      document,
      context.actor,
      status === 'REVIEWED'
        ? 'Finding reviewed and locked'
        : 'Finding review updated',
      `${finding.code}: ${status}${status === 'REVIEWED' ? '; supporting facts and evidence confirmed by reviewer' : ''}`,
    );
    return finding.id;
  }
  private reopenFinding(
    document: PlanningDocument,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    assertEdit(document, context.actor);
    if (document.kind !== 'SWOT')
      throw new BadRequestException('Choose a SWOT finding.');
    const finding = document.data.findings.find((f) => f.id === payload.id);
    if (!finding)
      throw new NotFoundException('Finding not found in this assessment.');
    const reviewed =
      finding.reviewStatus === 'REVIEWED' ||
      document.versions.some((v) =>
        v.data.findings.some((f) => f.id === finding.id),
      );
    const reason = cleanText(payload.reason);
    if (!reviewed || !reason)
      throw new BadRequestException(
        'Select a reviewed finding and explain why it must be reopened.',
      );
    finding.reviewStatus = 'UNDER_REVIEW';
    finding.reviewedAt = '';
    finding.reviewedBy = '';
    finding.updatedAt = new Date().toISOString();
    finding.updatedBy = context.actor.userId;
    document.acknowledgement = null;
    this.log(
      document,
      context.actor,
      'Finding reopened',
      `${finding.code}: ${reason}`,
    );
    return finding.id;
  }
  private deleteItem(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    actor: PlanningActor,
  ) {
    assertEdit(document, actor);
    const kind = cleanText(payload.kind) as ItemKind,
      id = cleanText(payload.id, 100);
    if (
      !['finding', 'objective', 'goal', 'assignment', 'action'].includes(kind)
    )
      throw new BadRequestException('Unknown item.');
    const key = itemList(kind),
      list = document.data[key] as unknown as { id: string; code: string }[];
    const item = list.find((i) => i.id === id);
    if (!item) throw new NotFoundException('Planning item not found.');
    if (
      document.versions.some((v) => v.data[key].some((i) => i.id === id)) ||
      (kind === 'finding' &&
        document.findingReviews?.some((review) => review.finding.id === id))
    )
      throw new BadRequestException(
        'Reviewed records cannot be deleted. Create a dated revision instead.',
      );
    const referenced = state.documents.some((d) =>
      [d.data, ...d.versions.map((v) => v.data)].some(
        (data) =>
          data.goals.some(
            (g) => g.objectiveId === id || g.parent?.goalId === id,
          ) ||
          data.assignments.some((k) => k.goalId === id) ||
          data.actions.some(
            (a) =>
              a.goalId === id ||
              a.parentActionId === id ||
              a.sources.some((s) => s.findingId === id),
          ) ||
          (data.actionLinks || []).some(
            (link) => link.goalId === id || link.actionId === id,
          ) ||
          data.objectives.some((o) =>
            o.sources.some((s) => s.findingId === id),
          ),
      ),
    );
    if (referenced)
      throw new BadRequestException(
        'This item is linked to other planning records and cannot be deleted.',
      );
    if (kind === 'goal' && document.kind === 'DEPARTMENT') {
      const goal = item as Goal;
      if (goal.parent)
        reserveDepartmentGoalNumbers(state, document, goal.parent);
    }
    if (kind === 'finding') {
      const finding = document.data.findings.find((f) => f.id === id)!;
      document.data.consideredPillars = document.data.consideredPillars.filter(
        (p) => p !== finding.pillar && !finding.relatedPillars.includes(p),
      );
    }
    list.splice(list.indexOf(item), 1);
    this.log(document, actor, 'Removed draft item', item.code);
  }
  private linkAction(
    document: PlanningDocument,
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
    today: string,
  ) {
    assertEdit(document, context.actor);
    const link: ActionLink = {
      id: randomUUID(),
      goalId: cleanText(payload.goalId, 100),
      documentId: cleanText(payload.documentId, 100),
      actionId: cleanText(payload.actionId, 100),
      version: Number(payload.version),
    };
    if (!Number.isInteger(link.version) || link.version < 1)
      throw new BadRequestException(
        'Select an approved department action version.',
      );
    const source = state.documents.find((d) => d.id === link.documentId);
    const issues = actionLinkIssues(document, link, state, today);
    if (
      !source ||
      (!permissions(source, context.actor).canRead &&
        !(document.kind === 'INDIVIDUAL' && issues.length === 0))
    )
      throw new ForbiddenException('You cannot access that department action.');
    if (issues.length) throw new BadRequestException({ message: issues });
    document.data.actionLinks ||= [];
    if (
      document.data.actionLinks.some(
        (l) => l.actionId === link.actionId && l.documentId === link.documentId,
      )
    )
      throw new ConflictException(
        'This department action is already linked to this plan.',
      );
    document.data.actionLinks.push(link);
    document.acknowledgement = null;
    this.log(
      document,
      context.actor,
      'Linked existing department action',
      link.actionId,
    );
    return link.id;
  }
  async command(user: AccessTokenPayload, command: PlanningCommand) {
    const context = await this.refs.get(user),
      today = organisationToday(context.references.timeZone);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.lexPlanningWorkspace.upsert({
          where: { organizationId: user.organizationId },
          create: {
            organizationId: user.organizationId,
            state: emptyPlanningState() as unknown as Prisma.InputJsonValue,
          },
          update: {},
        });
        if (row.revision !== command.expectedRevision)
          throw new ConflictException(
            'Someone updated this plan. Refresh the register before saving; your form entries have not been discarded.',
          );
        const state = this.useLibrary(
            this.readState(row.state),
            context.references,
          ),
          { actor, references } = context,
          payload = command.payload;
        const beforeDocument = command.documentId
          ? state.documents.find((d) => d.id === command.documentId)
          : undefined;
        const before = beforeDocument
          ? structuredClone(beforeDocument)
          : undefined;
        let focusId = '';
        let findingIds: string[] | undefined;
        if (command.action === 'CREATE_PLAN')
          focusId = this.createPlan(state, payload, context);
        else if (command.action === 'SAVE_DEFINITION') {
          const assignedCoordinator =
            !!actor.employeeId &&
            state.documents.some(
              (document) =>
                document.data.coordinatorIds.includes(actor.employeeId) &&
                permissions(document, actor).canRead,
            );
          if (
            !isCoordinator(actor) &&
            actor.role !== 'HOD' &&
            !assignedCoordinator
          )
            throw new ForbiddenException(
              'Only authorised planners can define measures.',
            );
          let kraId = cleanText(payload.kraId, 100);
          const adaptedKraFromId = cleanText(payload.adaptedKraFromId, 100);
          if (
            adaptedKraFromId &&
            (kraId || !state.kras.some((k) => k.id === adaptedKraFromId))
          )
            throw new BadRequestException(
              'To adapt a responsibility area, select its source and enter a new KRA name.',
            );
          if (!kraId) {
            const name = cleanText(payload.kraName, 120);
            if (!name)
              throw new BadRequestException(
                'Choose a KRA or name a new responsibility area.',
              );
            const existing = state.kras.find(
              (k) => k.name.toLowerCase() === name.toLowerCase(),
            );
            if (existing && adaptedKraFromId)
              throw new ConflictException(
                'Give the adapted KRA a distinct name, or select the existing responsibility area.',
              );
            kraId = existing?.id || randomUUID();
            if (!existing)
              state.kras.push({
                id: kraId,
                name,
                code: this.reference(state, 'KRA'),
                ...(adaptedKraFromId
                  ? { adaptedFromId: adaptedKraFromId }
                  : {}),
              });
          }
          if (!state.kras.some((k) => k.id === kraId))
            throw new BadRequestException('Choose an existing KRA.');
          const definition: KpiDefinition = {
            id: randomUUID(),
            code: this.reference(state, 'KPI'),
            kraId,
            name: cleanText(payload.name, 160),
            meaning: cleanText(payload.meaning),
            unit: cleanText(payload.unit, 40),
            direction: cleanText(
              payload.direction,
            ) as KpiDefinition['direction'],
            formula: cleanText(payload.formula) as KpiDefinition['formula'],
            inputA: cleanText(payload.inputA, 120),
            inputB: cleanText(payload.inputB, 120),
            aggregation: cleanText(
              payload.aggregation,
            ) as KpiDefinition['aggregation'],
            source: 'CUSTOM',
          };
          const adaptedFromId = cleanText(payload.adaptedFromId, 100);
          if (adaptedFromId) {
            if (!state.definitions.some((d) => d.id === adaptedFromId))
              throw new BadRequestException(
                'Select the existing KPI definition being adapted.',
              );
            definition.adaptedFromId = adaptedFromId;
          }
          validateDefinition(definition);
          if (
            state.definitions.some(
              (d) =>
                d.name.toLowerCase() === definition.name.toLowerCase() &&
                d.kraId === definition.kraId,
            )
          )
            throw new ConflictException(
              'That KPI already exists under this KRA. Reuse it or give the adapted definition a distinct name.',
            );
          state.definitions.push(definition);
          focusId = definition.id;
        } else {
          const document = state.documents.find(
            (d) => d.id === command.documentId,
          );
          if (!document)
            throw new NotFoundException('Plan not found in this organisation.');
          const access = permissions(document, actor);
          if (!access.canRead)
            throw new ForbiddenException('This plan is restricted.');
          focusId = document.id;
          if (command.action === 'SAVE_SETTINGS')
            this.settings(document, payload, context);
          else if (command.action === 'SAVE_ITEM')
            focusId = this.saveItem(document, state, payload, context);
          else if (command.action === 'SAVE_GOALS') {
            const ids = this.saveGoals(document, state, payload, context);
            focusId = ids[0] || document.id;
          } else if (command.action === 'APPROVE_ITEM')
            focusId = this.approveProgrammeItem(
              document,
              state,
              payload,
              context,
              today,
            );
          else if (command.action === 'REVISE_ITEM')
            focusId = this.reviseProgrammeItem(
              document,
              payload,
              context,
              today,
            );
          else if (command.action === 'SAVE_RESULT') {
            focusId = recordProgrammeResult(
              document,
              state,
              payload,
              actor,
              today,
            );
            this.log(document, actor, 'Recorded measurement', focusId);
          } else if (command.action === 'VERIFY_RESULT') {
            focusId = verifyProgrammeResult(document, state, payload, actor);
            this.log(document, actor, 'Verified measurement', focusId);
          } else if (command.action === 'SAVE_REVIEW') {
            focusId = reviewProgrammeResult(
              document,
              state,
              payload,
              actor,
              today,
            );
            this.log(document, actor, 'Recorded management review', focusId);
          } else if (command.action === 'UPDATE_ACTION_PROGRESS')
            focusId = this.updateProgrammeAction(
              document,
              state,
              payload,
              context,
            );
          else if (command.action === 'REVIEW_FINDINGS') {
            const ids = strings(payload.ids);
            if (
              !ids.length ||
              ids.length > 50 ||
              new Set(ids).size !== ids.length
            )
              throw new BadRequestException(
                'Select between 1 and 50 distinct findings.',
              );
            for (const id of ids)
              this.reviewFinding(document, { ...payload, id }, context);
            focusId = ids[0];
          } else if (command.action === 'SAVE_FINDINGS') {
            findingIds = this.saveFindings(document, state, payload, context);
            focusId = findingIds[0];
          } else if (command.action === 'REVIEW_FINDING')
            focusId = this.reviewFinding(document, payload, context);
          else if (command.action === 'REOPEN_FINDING')
            focusId = this.reopenFinding(document, payload, context);
          else if (command.action === 'LINK_ACTION')
            focusId = this.linkAction(document, state, payload, context, today);
          else if (command.action === 'UNLINK_ACTION') {
            assertEdit(document, actor);
            const link = document.data.actionLinks?.find(
              (l) => l.id === payload.id,
            );
            if (!link)
              throw new NotFoundException(
                'Linked action not found in this plan.',
              );
            document.data.actionLinks = document.data.actionLinks!.filter(
              (l) => l.id !== link.id,
            );
            document.acknowledgement = null;
            this.log(
              document,
              actor,
              'Unlinked department action',
              link.actionId,
            );
          } else if (command.action === 'DELETE_ITEM') {
            this.deleteItem(document, state, payload, actor);
            if (payload.kind === 'finding')
              await tx.lexPlanningEvidence.deleteMany({
                where: {
                  organizationId: user.organizationId,
                  findingId: String(payload.id),
                },
              });
          } else if (command.action === 'CONSIDER_PILLAR') {
            assertEdit(document, actor);
            if (
              document.kind !== 'SWOT' ||
              !PILLAR_CODES.includes(payload.pillar as never)
            )
              throw new BadRequestException('Choose a SWOT pillar.');
            const pillar = payload.pillar as Finding['pillar'];
            document.data.consideredPillars =
              document.data.consideredPillars.includes(pillar)
                ? document.data.consideredPillars.filter((p) => p !== pillar)
                : [...document.data.consideredPillars, pillar];
            this.log(document, actor, 'Pillar consideration changed', pillar);
          } else if (command.action === 'CONSIDER_ALL_PILLARS') {
            assertEdit(document, actor);
            if (document.kind !== 'SWOT')
              throw new BadRequestException(
                'Pillar consideration is only available for SWOT assessments.',
              );
            const newlyConsidered = PILLAR_CODES.filter(
              (pillar) => !document.data.consideredPillars.includes(pillar),
            );
            if (newlyConsidered.length) {
              // One atomic confirmation; repeating it never toggles a pillar off.
              document.data.consideredPillars = [...PILLAR_CODES];
              this.log(
                document,
                actor,
                'All pillars marked considered',
                `Newly considered: ${newlyConsidered.join(', ')}`,
              );
            }
          } else if (command.action === 'REVISE') {
            if (!access.canApprove || document.status !== 'APPROVED')
              throw new ForbiddenException(
                'The designated approver can open a revision of an approved plan.',
              );
            const reason = cleanText(payload.reason),
              effectiveDate = cleanText(payload.effectiveDate, 10);
            if (!reason || !validDate(effectiveDate) || effectiveDate < today)
              throw new BadRequestException(
                'Enter a revision reason and an effective date of today or later.',
              );
            document.data = structuredClone(document.versions.at(-1)!.data);
            if (
              document.kind === 'COMPANY' &&
              document.versions.at(-1)!.legacyCompanyGoals
            )
              document.data.goals = structuredClone(
                document.versions.at(-1)!.legacyCompanyGoals!,
              );
            if (document.kind === 'SWOT')
              for (const finding of document.data.findings) {
                finding.reviewStatus =
                  finding.basis === 'NEEDS_CHECKING'
                    ? 'NEEDS_EVIDENCE'
                    : 'UNDER_REVIEW';
                finding.reviewedAt = '';
                finding.reviewedBy = '';
              }
            document.status = 'DRAFT';
            for (const approval of document.itemApprovals || []) {
              approval.status = 'DRAFT';
              approval.reason = reason;
              approval.effectiveDate = effectiveDate;
            }
            document.revisionReason = reason;
            document.effectiveDate = effectiveDate;
            document.acknowledgement = null;
            this.log(document, actor, 'Revision opened', reason);
          } else if (command.action === 'RETURN') {
            if (!access.canApprove || document.status !== 'IN_REVIEW')
              throw new ForbiddenException(
                'Only the designated approver can return a submitted plan.',
              );
            const reason = cleanText(payload.reason);
            if (!reason)
              throw new BadRequestException('Explain what needs to change.');
            document.status = 'DRAFT';
            this.log(document, actor, 'Returned for changes', reason);
          } else if (command.action === 'ACKNOWLEDGE') {
            const version = published(document, today);
            if (
              document.kind !== 'INDIVIDUAL' ||
              document.scopeId !== actor.employeeId ||
              !version
            )
              throw new ForbiddenException(
                'You may acknowledge only your own effective approved plan.',
              );
            document.acknowledgement = {
              actorId: actor.userId,
              at: new Date().toISOString(),
              version: version.version,
            };
            this.log(
              document,
              actor,
              'Employee acknowledged plan',
              `Version ${version.version}`,
            );
          } else if (
            command.action === 'APPROVE' ||
            command.action === 'SUBMIT'
          ) {
            if (command.action === 'SUBMIT') assertEdit(document, actor);
            else if (!access.canApprove || document.status === 'APPROVED')
              throw new ForbiddenException(
                'Only the designated approver may finalise this version.',
              );
            const issues = planningReadinessIssues(
              document,
              state,
              references,
              today,
            );
            if (issues.length)
              throw new BadRequestException({ message: issues });
            if (command.action === 'SUBMIT') {
              document.status = 'IN_REVIEW';
              this.log(document, actor, 'Submitted for one review');
            } else {
              if (document.kind === 'SWOT')
                for (const finding of document.data.findings) {
                  // Whole-assessment approval remains a supported review route.
                  // Unconfirmed evidence is never promoted to an eligible source.
                  finding.reviewStatus =
                    finding.basis === 'NEEDS_CHECKING' ||
                    finding.response === 'VERIFY'
                      ? 'NEEDS_EVIDENCE'
                      : 'REVIEWED';
                  finding.reviewedAt =
                    finding.reviewStatus === 'REVIEWED'
                      ? new Date().toISOString()
                      : '';
                  finding.reviewedBy =
                    finding.reviewStatus === 'REVIEWED' ? actor.userId : '';
                }
              const version: ApprovedVersion = {
                ...(document.kind === 'COMPANY'
                  ? {
                      companyPlanningModel: 'MEASURABLE_OBJECTIVES' as const,
                      ...(document.data.goals.length
                        ? {
                            legacyCompanyGoals: structuredClone(
                              document.data.goals,
                            ),
                          }
                        : {}),
                    }
                  : {}),
                version:
                  Math.max(
                    0,
                    ...document.versions.map((v) => v.version),
                    ...(document.findingReviews || []).map((v) => v.version),
                  ) + 1,
                data: structuredClone(
                  document.kind === 'COMPANY'
                    ? { ...document.data, goals: [] }
                    : document.data,
                ),
                approvedAt: new Date().toISOString(),
                approvedBy: actor.userId,
                effectiveDate: document.effectiveDate || today,
                definitions: structuredClone(
                  state.definitions.filter(
                    (k) =>
                      document.data.assignments.some(
                        (a) => a.definitionId === k.id,
                      ) ||
                      document.data.goals.some((g) => g.definitionId === k.id),
                  ),
                ),
                reason: document.revisionReason,
              };
              document.versions.push(version);
              if (
                ['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind)
              )
                document.itemApprovals = (
                  document.kind === 'COMPANY'
                    ? document.data.objectives
                    : document.data.goals
                ).map((item) => ({
                  kind:
                    document.kind === 'COMPANY'
                      ? ('objective' as const)
                      : ('goal' as const),
                  itemId: item.id,
                  status: 'APPROVED' as const,
                  version: version.version,
                  approvedAt: version.approvedAt,
                  approvedBy: version.approvedBy,
                  effectiveDate: version.effectiveDate,
                }));
              document.status = 'APPROVED';
              this.log(
                document,
                actor,
                document.kind === 'SWOT'
                  ? 'Reviewed and finalised SWOT'
                  : 'Approved and locked plan',
                `Version ${version.version}`,
              );
            }
          }
        }
        if (command.action !== 'SAVE_DEFINITION') {
          const changed = state.documents.find(
            (d) => d.id === (command.documentId || focusId),
          );
          if (changed?.history.length) {
            const history = changed.history.at(-1)!;
            if (!before || changed.history.length > before.history.length)
              history.changes = changesBetween(before, changed);
          }
        }
        if (
          state.documents.length > 500 ||
          JSON.stringify(state).length > 12000000
        )
          throw new BadRequestException(
            'This workspace exceeds the supported planning size.',
          );
        const result = await tx.lexPlanningWorkspace.updateMany({
          where: {
            organizationId: user.organizationId,
            revision: row.revision,
          },
          data: {
            state: state as unknown as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new ConflictException(
            'The plan changed while saving. Refresh before retrying.',
          );
        return {
          ...this.view(state, row.revision + 1, context),
          focusId,
          ...(findingIds ? { findingIds } : {}),
        };
      },
      { timeout: 30000 },
    );
  }
  // Area 04–07 consume the same stable references and verified-measure definitions.
  // Company achievement is never calculated from departmental or action roll-ups.
  async getApproved(user: AccessTokenPayload) {
    const workspace = await this.getWorkspace(user),
      today = organisationToday(workspace.references.timeZone);
    return workspace.documents
      .filter((d) => d.kind !== 'SWOT')
      .flatMap((d) => {
        const version = published(d, today);
        if (!version) return [];
        // Archived legacy rows are retained for editing/history, never handed
        // to results modules as newly approved commitments.
        const approvedVersion = { ...version };
        delete approvedVersion.legacyCompanyGoals;
        return [
          {
            id: d.id,
            code: d.code,
            kind: d.kind,
            scopeId: d.scopeId,
            cycle: d.cycle,
            ...approvedVersion,
            linkedActions: (version.data.actionLinks || []).flatMap((link) => {
              const shared = workspace.sharedActions.find(
                (a) =>
                  a.documentId === link.documentId &&
                  a.version === link.version &&
                  a.action.id === link.actionId,
              );
              return shared ? [{ ...link, action: shared.action }] : [];
            }),
          },
        ];
      });
  }
}
