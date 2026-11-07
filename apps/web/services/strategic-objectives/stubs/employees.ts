import type { Employee } from "../types";

// Employees and positions are EMS dependencies, not new master records.
export const employees: readonly Employee[] = [
  {
    id: "demo-emp-01",
    name: "Amina Shah",
    departmentId: "demo-dept-leadership",
    position: "Chief Executive Officer",
  },
  {
    id: "demo-emp-02",
    name: "David Otieno",
    departmentId: "demo-dept-leadership",
    position: "Authorised Plan Approver",
  },
  {
    id: "demo-emp-03",
    name: "Meera Rao",
    departmentId: "demo-dept-production",
    position: "Production Head",
  },
  {
    id: "demo-emp-04",
    name: "Peter Kamau",
    departmentId: "demo-dept-production",
    position: "Production Supervisor",
  },
  {
    id: "demo-emp-05",
    name: "Grace Mwangi",
    departmentId: "demo-dept-quality",
    position: "Quality Head",
  },
  {
    id: "demo-emp-06",
    name: "Arjun Patel",
    departmentId: "demo-dept-quality",
    position: "Quality Engineer",
  },
  {
    id: "demo-emp-07",
    name: "Faith Njeri",
    departmentId: "demo-dept-maintenance",
    position: "Maintenance Head",
  },
  {
    id: "demo-emp-08",
    name: "Daniel Kimani",
    departmentId: "demo-dept-maintenance",
    position: "Maintenance Technician",
  },
  {
    id: "demo-emp-09",
    name: "Priya Shah",
    departmentId: "demo-dept-supply",
    position: "Supply Chain Head",
  },
  {
    id: "demo-emp-10",
    name: "Esther Wanjiku",
    departmentId: "demo-dept-people",
    position: "People & Culture Head",
  },
  {
    id: "demo-emp-11",
    name: "Samuel Kariuki",
    departmentId: "demo-dept-finance",
    position: "Finance Head",
  },
  {
    id: "demo-emp-12",
    name: "Neha Mehta",
    departmentId: "demo-dept-sales",
    position: "Sales & Customer Success Head",
  },
];
