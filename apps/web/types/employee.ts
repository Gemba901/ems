export interface Committee {
  id: string;
  name: string;
  type: string;
}

export interface EmployeeProfileData {
  id: string;
  userId: string | null;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  roleId: number | null;
  department: string;
  departmentId: string | null;
  organizationId: string;
  status: 'Active' | 'Onboarding' | 'Suspended';
  email: string | null;
  phone: string;
  avatarUrl: string | null;
  employmentType: string;
  committees: Committee[];
  directReports: { name: string; avatar?: string }[];
  metrics: {
    projectsCompleted: number;
    utilizationRate: number;
    velocity: string;
  };
}
