import type { EmsDirectoryPerson } from 'src/ems/directory/ems-directory.contract';

/** LEX owns its presentation shapes; EMS never imports LEX contracts. Unavailable IDs stay private. */
export function structureEmployee(p: EmsDirectoryPerson) {
  return {
    id: p.id,
    firstName: p.name,
    lastName: '',
    jobTitle: p.jobTitle,
    avatarUrl: p.avatarUrl,
    departmentId: p.departmentId,
    plantBranch: p.branch,
    section: p.section,
    employmentStatus: p.employmentStatus,
    reportingManagerId: p.reporting.managerId,
    reportsToBody: p.reporting.body,
    reportingUnavailable: ['UNAVAILABLE', 'PENDING', 'CONFLICT'].includes(
      p.reporting.state,
    ),
  };
}
