import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PlanningReferencesService } from './planning-references.service';
import { emptyPlanningState } from './planning.seed';
import {
  approvedParentGoals,
  assertEdit,
  actionLinkIssues,
  blankData,
  cleanItem,
  cleanText,
  eligibleSources,
  isCoordinator,
  isManager,
  itemList,
  MANAGEMENT,
  permissions,
  PILLAR_CODES,
  published,
  sanitizeForReader,
  strings,
  validDate,
  validateDefinition,
  validatePlan,
} from './planning.rules';
import type {
  ApprovedVersion,
  Finding,
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
          issues:
            access.canEdit || access.canApprove
              ? validatePlan(document, state, context.references, today)
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
    // A transferred employee retains their approved action commitment without
    // gaining access to the rest of the former department's current plan.
    for (const document of documents)
      for (const data of [
        document.data,
        ...document.versions.map((v) => v.data),
      ])
        for (const link of data.actionLinks || []) {
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
    return {
      revision,
      ...context,
      documents,
      kras: state.kras,
      definitions: state.definitions,
      sharedActions,
      approvedParentGoals: approvedParentGoals(state, context.actor),
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
    return [prefix, pillar, cycle, String(state.sequence).padStart(4, '0')]
      .filter(Boolean)
      .join('-');
  }
  private createPlan(
    state: PlanningState,
    payload: Record<string, unknown>,
    context: Context,
  ) {
    const kind = cleanText(payload.kind) as PlanningDocument['kind'],
      cycle = cleanText(payload.cycle, 30),
      scope = cleanText(payload.scopeId, 200);
    if (
      ![
        'SWOT',
        'COMPANY',
        'DEPARTMENT',
        'TEAM',
        'POSITION',
        'INDIVIDUAL',
      ].includes(kind) ||
      !/^\d{4}$/.test(cycle) ||
      Number(cycle) < 2000 ||
      Number(cycle) > 2200
    )
      throw new BadRequestException(
        'Select a plan type and a valid planning year.',
      );
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
        'This scope already has a plan for the year. Open its existing plan.',
      );
    // Keep the real EMS scope, but do not require another planning record just
    // to save a draft. The related department plan is checked at finalisation.
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
    data.startDate = `${cycle}-01-01`;
    data.endDate = `${cycle}-12-31`;
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
    assertEdit(document, context.actor);
    const kind = cleanText(payload.kind) as ItemKind;
    if (
      !['finding', 'objective', 'goal', 'assignment', 'action'].includes(kind)
    )
      throw new BadRequestException('Unknown planning item.');
    if (
      document.kind === 'SWOT'
        ? kind !== 'finding'
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
    if (id && !old)
      throw new NotFoundException('The item does not belong to this plan.');
    if (
      !payload.data ||
      typeof payload.data !== 'object' ||
      Array.isArray(payload.data)
    )
      throw new BadRequestException('Invalid planning fields.');
    const itemInput = payload.data as Record<string, unknown>;
    const oldCalendar =
      kind === 'assignment'
        ? (old as unknown as Assignment | undefined)?.calendar
        : undefined;
    const itemReferences =
      oldCalendar && itemInput.useCurrentCalendar !== true
        ? { ...context.references, calendar: oldCalendar }
        : context.references;
    const data = cleanItem(kind, itemInput, itemReferences);
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
        const parent = data.parent as {
          documentId: string;
          goalId: string;
          version: number;
        };
        const parentDoc = state.documents.find(
          (d) => d.id === parent.documentId,
        );
        const version = parentDoc?.versions.find(
          (v) => v.version === parent.version,
        );
        const linked = version?.data.goals.find((g) => g.id === parent.goalId);
        const matchingScope =
          document.kind === 'DEPARTMENT'
            ? parentDoc?.kind === 'COMPANY' &&
              linked?.departmentIds.includes(document.scopeId)
            : ['TEAM', 'POSITION', 'INDIVIDUAL'].includes(document.kind) &&
              parentDoc?.kind === 'DEPARTMENT' &&
              parentDoc.scopeId === document.departmentId;
        if (
          !parentDoc ||
          !linked ||
          parentDoc.cycle !== document.cycle ||
          !matchingScope ||
          !permissions(parentDoc, context.actor).canRead
        )
          throw new BadRequestException(
            'Choose an approved parent goal for this department and planning cycle.',
          );
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
    const at = new Date().toISOString(),
      item = {
        ...data,
        id: old?.id || randomUUID(),
        code:
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
    if (document.versions.some((v) => v.data[key].some((i) => i.id === id)))
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
    if (!source || !permissions(source, context.actor).canRead)
      throw new ForbiddenException('You cannot access that department action.');
    const issues = actionLinkIssues(document, link, state, today);
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
            document.status = 'DRAFT';
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
            const issues = validatePlan(document, state, references, today);
            if (issues.length)
              throw new BadRequestException({ message: issues });
            if (command.action === 'SUBMIT') {
              document.status = 'IN_REVIEW';
              this.log(document, actor, 'Submitted for one review');
            } else {
              const version: ApprovedVersion = {
                version: document.versions.length + 1,
                data: structuredClone(document.data),
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
        return { ...this.view(state, row.revision + 1, context), focusId };
      },
      { timeout: 30000 },
    );
  }
  // Area 04–07 consume the same stable references and verified-measure definitions.
  // No results or departmental score roll-ups are calculated by Area 03.
  async getApproved(user: AccessTokenPayload) {
    const workspace = await this.getWorkspace(user),
      today = organisationToday(workspace.references.timeZone);
    return workspace.documents
      .filter((d) => d.kind !== 'SWOT')
      .flatMap((d) => {
        const version = published(d, today);
        return version
          ? [
              {
                id: d.id,
                code: d.code,
                kind: d.kind,
                scopeId: d.scopeId,
                cycle: d.cycle,
                ...version,
                linkedActions: (version.data.actionLinks || []).flatMap(
                  (link) => {
                    const shared = workspace.sharedActions.find(
                      (a) =>
                        a.documentId === link.documentId &&
                        a.version === link.version &&
                        a.action.id === link.actionId,
                    );
                    return shared ? [{ ...link, action: shared.action }] : [];
                  },
                ),
              },
            ]
          : [];
      });
  }
}
