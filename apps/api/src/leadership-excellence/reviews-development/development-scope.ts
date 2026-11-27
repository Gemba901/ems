import { Role } from 'src/common/enum/role.enum';
import type { MonitoringActor } from '../monitoring-control/monitoring-scope';
import { DEVELOPMENT_ORG_WIDE } from './reviews-development.roles';

/** The caller, as Area 05 resolves it (employee, department, direct reports). */
export type DevelopmentActor = MonitoringActor;

/** One core employee as Area 06 needs it. */
export interface DevelopmentPerson {
  id: string;
  name: string;
  departmentId: string | null;
  managerId: string | null;
  active: boolean;
}

export type People = Map<string, DevelopmentPerson>;

export const isOrgWide = (actor: DevelopmentActor) =>
  DEVELOPMENT_ORG_WIDE.includes(actor.role);

const isHodOf = (actor: DevelopmentActor, departmentId: string | null) =>
  actor.role === Role.HOD &&
  !!actor.departmentId &&
  departmentId === actor.departmentId;

interface Participants {
  subjectId: string;
  reviewerId: string;
  departmentId: string | null;
}

export const isParticipant = (actor: DevelopmentActor, r: Participants) =>
  !!actor.employeeId &&
  (actor.employeeId === r.subjectId || actor.employeeId === r.reviewerId);

/**
 * Who may know a review or coaching record exists (ids, dates, status):
 * its participants, the subject's manager, the department's HOD, org-wide roles.
 */
export function canSeeMetadata(actor: DevelopmentActor, r: Participants) {
  return (
    isParticipant(actor, r) ||
    actor.reportIds.has(r.subjectId) ||
    isHodOf(actor, r.departmentId) ||
    isOrgWide(actor)
  );
}

/**
 * Who may read a review's content. Personal reviews are confidential to their
 * two participants. Department reviews describe a department's results, so the
 * same people who may see the metadata may read them.
 */
export function canReadReview(
  actor: DevelopmentActor,
  r: Participants & { type: 'DEPARTMENT' | 'PERSONAL' },
) {
  if (r.type === 'PERSONAL') return isParticipant(actor, r);
  return canSeeMetadata(actor, r);
}

/** Who may see an action's effectiveness check. */
export function canSeeAction(
  actor: DevelopmentActor,
  a: {
    ownerId: string;
    departmentId: string | null;
    goalOwnerId: string | null;
  },
  assessedById?: string | null,
) {
  const me = actor.employeeId;
  return (
    isOrgWide(actor) ||
    isHodOf(actor, a.departmentId) ||
    (!!me &&
      (me === a.ownerId ||
        me === a.goalOwnerId ||
        me === assessedById ||
        actor.reportIds.has(a.ownerId)))
  );
}

/**
 * An independent checker: never the owner; the person who confirmed completion,
 * the department's HOD, the owner's manager or the goal owner.
 */
export function canAssessAction(
  actor: DevelopmentActor,
  a: {
    ownerId: string;
    departmentId: string | null;
    goalOwnerId: string | null;
    checkedById: string | null;
  },
  people: People,
) {
  const me = actor.employeeId;
  if (!me || !actor.active || me === a.ownerId) return false;
  return (
    a.checkedById === me ||
    isHodOf(actor, a.departmentId) ||
    people.get(a.ownerId)?.managerId === me ||
    a.goalOwnerId === me
  );
}

/**
 * The caller's own right to an action, independent of any review or coaching
 * link: they may see it, or they may assess it once completion is checked.
 * Linking an action requires this, so a link never grants access by itself.
 */
export function canAccessAction(
  actor: DevelopmentActor,
  a: {
    ownerId: string;
    departmentId: string | null;
    goalOwnerId: string | null;
    checkedById: string | null;
    status: string;
  },
  people: People,
) {
  return (
    canSeeAction(actor, a) ||
    (a.status === 'VERIFIED' && canAssessAction(actor, a, people))
  );
}

/** YYYY-MM-DD, strictly valid. */
export const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export const today = () => new Date().toISOString().slice(0, 10);
