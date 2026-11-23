import { Role } from 'src/common/enum/role.enum';
/** Company-wide HR detail. Team/self detail is authorised separately by the person-details service. */
export const canReadCompanyEmployment = (role: Role | undefined) =>
  !!role &&
  [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.MANAGEMENT].includes(role);
