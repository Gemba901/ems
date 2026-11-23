import { Injectable } from '@nestjs/common';
import { EmsDirectoryService } from 'src/ems/directory/ems-directory.service';
import { normaliseKey } from 'src/ems/onboarding-text';
import type { OrganisationStructureProvider } from '../organogram/organisation-structure.contract';
import { buildOrganisationStructure } from '../organogram/organisation-structure';
import { structureEmployee } from './ems-source-mapping';

@Injectable()
export class EmsStructureSource implements OrganisationStructureProvider {
  constructor(private readonly directory: EmsDirectoryService) {}
  async getStructure(organizationId: string) {
    const data = await this.directory.getOrganisation(organizationId);
    return buildOrganisationStructure({
      company: data.company,
      departments: data.departments,
      employees: data.people.map(structureEmployee),
      branchKeyOf: normaliseKey,
      recordedHods: data.hodAssignments,
      source: {
        kind: 'EMS',
        label: 'EMS people and recorded department HODs',
        loadedAt: data.loadedAt,
      },
    });
  }
}
