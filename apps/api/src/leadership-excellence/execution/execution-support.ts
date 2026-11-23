import type {
  PlanningActor,
  PlanningPerson,
} from '../performance-planning/planning.types';

/** Support contacts may identify an EMS employee or their linked user account. */
export function matchesSupportPerson(
  actor: PlanningActor,
  people: Pick<PlanningPerson, 'id' | 'userId'>[],
  id: string,
): boolean {
  return (
    !!id &&
    ((!!actor.employeeId && id === actor.employeeId) ||
      (!!actor.userId &&
        (id === actor.userId ||
          people.some(
            (person) => person.id === id && person.userId === actor.userId,
          ))))
  );
}
