// types/employee.ts
export interface EmployeeProfileData {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  department: string;
  status: 'Active' | 'Onboarding' | 'Suspended';
  email: string;
  phone: string;
  dob: string;
  nationalId: string;
  address: string;
  employmentType: string;
  supervisor?: { name: string; role: string; avatar?: string };
  directReports: { name: string; avatar?: string }[];
  metrics: {
    projectsCompleted: number;
    utilizationRate: number;
    velocity: string;
  };
}