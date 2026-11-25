import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { OrganisationStructureProvider } from '../common/contracts';
import { OrganogramService } from '../organisation-framework/organogram/organogram.service';
import {
  PLANNING_PEOPLE_METADATA_SOURCE,
  type PlanningDirectory,
  type PlanningPeopleMetadataSource,
  type PlanningPeopleSource,
} from './planning-people.contracts';

/** Maps the owner's shared directory without creating planning-specific masters. */
@Injectable()
export class PlanningPeopleService implements PlanningPeopleSource {
  constructor(
    @Inject(OrganogramService)
    private readonly structure: OrganisationStructureProvider,
    @Inject(PLANNING_PEOPLE_METADATA_SOURCE)
    private readonly metadata: PlanningPeopleMetadataSource,
  ) {}

  private async getStructure(organizationId: string) {
    const structure = await this.structure.getStructure(organizationId);
    if (
      structure.company.id !== organizationId ||
      structure.source.kind === 'SAMPLE'
    )
      throw new ConflictException(
        'The organisation directory does not contain live records for this company. Refresh the EMS references before continuing.',
      );
    return structure;
  }

  async getDirectory(organizationId: string): Promise<PlanningDirectory> {
    const structure = await this.getStructure(organizationId);
    // The same department can appear at several branches. Only its original
    // departmentId is a planning identity, never the derived chart unit ID.
    const departments = [
      ...new Map(
        structure.units
          .filter((unit) => unit.type === 'DEPARTMENT' && unit.departmentId)
          .map((unit) => [
            unit.departmentId!,
            { id: unit.departmentId!, name: unit.name },
          ]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    const departmentIds = new Set(
      departments.map((department) => department.id),
    );
    const units = new Map(structure.units.map((unit) => [unit.id, unit]));
    const departmentOf = (unitId: string): string | null => {
      let unit = units.get(unitId);
      const visited = new Set<string>();
      while (unit && !visited.has(unit.id)) {
        if (unit.departmentId && departmentIds.has(unit.departmentId))
          return unit.departmentId;
        visited.add(unit.id);
        unit = unit.parentId ? units.get(unit.parentId) : undefined;
      }
      return null;
    };
    const members = [
      ...new Map(
        structure.members
          .filter((member) => member.active || member.probation)
          .map((member) => [member.id, member]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    const records = await this.metadata.getPeopleMetadata(
      organizationId,
      members.map((member) => member.id),
    );
    const metadata = new Map(records.map((person) => [person.id, person]));
    const people: PlanningDirectory['people'] = [];
    const teams = new Map<string, PlanningDirectory['teams'][number]>();
    const updatedDates: string[] = [];
    for (const member of members) {
      const person = metadata.get(member.id);
      // A person removed or made inactive between the two sources is not a new
      // assignment candidate. Lack of a login account does not exclude staff.
      if (!person) continue;
      const departmentId = departmentOf(member.unitId);
      if (person.departmentId !== departmentId)
        throw new ConflictException(
          'An employee department changed while loading the organisation directory. Refresh the EMS references before continuing.',
        );
      people.push({
        id: member.id,
        name: member.name,
        position: member.jobTitle || 'Position not set',
        departmentId,
        userId: person.userId,
        role: person.userId ? person.role : 'EMPLOYEE',
      });
      if (Number.isFinite(Date.parse(person.updatedAt)))
        updatedDates.push(person.updatedAt);
      // Keep existing section-based team IDs: chart sections normalise labels
      // and include branches, so substituting their IDs would break saved links.
      const section = person.section?.trim();
      if (departmentId && section) {
        const id = `${departmentId}:${section}`;
        let team = teams.get(id);
        if (!team) {
          team = { id, name: section, departmentId, memberIds: [] };
          teams.set(id, team);
        }
        team.memberIds.push(member.id);
      }
    }
    return {
      departments,
      people,
      teams: [...teams.values()],
      source: `${structure.source.label}; planning account and section metadata`,
      refreshedAt: new Date().toISOString(),
      sourceUpdatedAt: updatedDates.length
        ? new Date(
            Math.max(...updatedDates.map((date) => Date.parse(date))),
          ).toISOString()
        : undefined,
    };
  }

  getAccountName(organizationId: string, userId: string) {
    return this.metadata.getAccountName(organizationId, userId);
  }

  getTimeZone(organizationId: string) {
    return this.metadata.getTimeZone(organizationId);
  }

  findEligibleEmployee(organizationId: string, employeeId: string) {
    return this.metadata.findEligibleEmployee(organizationId, employeeId);
  }

  async departmentExists(
    organizationId: string,
    departmentId: string,
  ): Promise<boolean> {
    const structure = await this.getStructure(organizationId);
    return structure.units.some(
      (unit) =>
        unit.type === 'DEPARTMENT' && unit.departmentId === departmentId,
    );
  }
}
