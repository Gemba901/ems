'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Download, MoreHorizontal, Plus, Search, Trash2, Upload, UserRound, Users2 } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  status: 'ACTIVE' | 'ON LEAVE' | 'PROBATION';
  joinedDate: string;
}

type EmployeeStatus = Employee['status'];

const initialEmployees: Employee[] = [
  { id: 'EMP-8492', name: 'Elena Rodriguez', email: 'elena.r@acme.com', department: 'Engineering', position: 'Senior Frontend Dev', status: 'ACTIVE', joinedDate: 'Jan 12, 2022' },
  { id: 'EMP-8501', name: 'Marcus Thompson', email: 'm.thompson@acme.com', department: 'Design', position: 'Product Designer', status: 'ON LEAVE', joinedDate: 'Mar 05, 2021' },
  { id: 'EMP-9122', name: 'Sarah Jenkins', email: 'sarah.j@acme.com', department: 'Marketing', position: 'Growth Manager', status: 'PROBATION', joinedDate: 'Nov 15, 2023' },
  { id: 'EMP-1102', name: 'John Doe', email: 'john.d@acme.com', department: 'Engineering', position: 'DevOps Engineer', status: 'ACTIVE', joinedDate: 'Aug 22, 2020' },
  { id: 'EMP-1134', name: 'Lisa Wong', email: 'lisa.w@acme.com', department: 'HR', position: 'Talent Acquisition', status: 'ACTIVE', joinedDate: 'May 10, 2023' },
  { id: 'EMP-2231', name: 'Aaron Miller', email: 'a.miller@acme.com', department: 'Sales', position: 'Account Executive', status: 'ACTIVE', joinedDate: 'Dec 01, 2021' },
  { id: 'EMP-4421', name: 'Kelly Brown', email: 'k.brown@acme.com', department: 'Engineering', position: 'QA Analyst', status: 'PROBATION', joinedDate: 'Feb 28, 2024' },
  { id: 'EMP-5523', name: 'Ryan Kim', email: 'r.kim@acme.com', department: 'Marketing', position: 'Content Strategist', status: 'ACTIVE', joinedDate: 'Jun 14, 2022' },
  { id: 'EMP-6671', name: 'Chloe Chen', email: 'c.chen@acme.com', department: 'Design', position: 'UX Researcher', status: 'ON LEAVE', joinedDate: 'Sep 30, 2021' },
  { id: 'EMP-7712', name: 'Sam Patel', email: 's.patel@acme.com', department: 'Finance', position: 'Senior Accountant', status: 'ACTIVE', joinedDate: 'Mar 12, 2019' },
];

const departments = ['All Departments', 'Engineering', 'Design', 'Marketing', 'HR', 'Sales', 'Finance'];
const statusOptions = ['All Statuses', 'ACTIVE', 'ON LEAVE', 'PROBATION'];
const employmentTypes = ['Full-time', 'Part-time', 'Contract'];

const getStatusStyles = (status: EmployeeStatus) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700';
    case 'ON LEAVE':
      return 'bg-sky-50 text-sky-700';
    case 'PROBATION':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [selectedEmployment, setSelectedEmployment] = useState('Full-time');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(initialEmployees[0].id);
  const [importMessage, setImportMessage] = useState('');
  const [form, setForm] = useState({ name: '', email: '', department: 'Engineering', position: '', status: 'ACTIVE' as EmployeeStatus });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsPerPage = 8;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDepartment, selectedStatus]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDepartment = selectedDepartment === 'All Departments' || emp.department === selectedDepartment;
      const matchesStatus = selectedStatus === 'All Statuses' || emp.status === selectedStatus;
      const matchesEmployment = Boolean(selectedEmployment);

      return matchesSearch && matchesDepartment && matchesStatus && matchesEmployment;
    });
  }, [employees, searchQuery, selectedDepartment, selectedStatus, selectedEmployment]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / itemsPerPage));
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const activeEmployee = employees.find((employee) => employee.id === activeEmployeeId) ?? null;

  const toggleSelected = (employeeId: string) => {
    setSelectedIds((current) => (current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]));
  };

  const handleAddEmployee = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.position) {
      return;
    }

    const newEmployee: Employee = {
      id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: form.name,
      email: form.email,
      department: form.department,
      position: form.position,
      status: form.status,
      joinedDate: 'Today',
    };

    setEmployees((current) => [newEmployee, ...current]);
    setActiveEmployeeId(newEmployee.id);
    setForm({ name: '', email: '', department: 'Engineering', position: '', status: 'ACTIVE' });
    setShowAddModal(false);
    setSelectedIds([]);
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportMessage(`${file.name} is ready to be imported into the employee directory.`);
    event.target.value = '';
  };

  const handleExport = () => {
    const rows = filteredEmployees.map((employee) => [employee.id, employee.name, employee.email, employee.department, employee.position, employee.status, employee.joinedDate].join(','));
    const csv = ['id,name,email,department,position,status,joinedDate', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'employees.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setEmployees((current) => current.filter((employee) => !selectedIds.includes(employee.id)));
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                <Users2 className="h-4 w-4" />
                Employee directory
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">Employees</h1>
              <p className="mt-1 text-sm text-slate-600">Manage your workforce with a faster, more polished experience.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
              <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                <Upload className="h-4 w-4" />
                Import
              </button>
              <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                Add employee
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, ID, or email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none ring-0"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select value={selectedEmployment} onChange={(event) => setSelectedEmployment(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {employmentTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          {importMessage ? <p className="mt-3 text-sm text-emerald-600">{importMessage}</p> : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Team roster</h2>
                <p className="text-xs text-slate-500">{filteredEmployees.length} records match your filters</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button onClick={handleDeleteSelected} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {paginatedEmployees.map((employee) => (
                <div key={employee.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedIds.includes(employee.id)} onChange={() => toggleSelected(employee.id)} className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {employee.name.split(' ').map((part) => part[0]).join('')}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{employee.name}</p>
                      <p className="text-sm text-slate-500">{employee.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusStyles(employee.status)}`}>{employee.status}</span>
                    <span className="text-sm text-slate-500">{employee.department}</span>
                    <button onClick={() => setActiveEmployeeId(employee.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">Showing {paginatedEmployees.length} of {filteredEmployees.length} employees</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50">
                  Previous
                </button>
                <span className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{currentPage}</span>
                <button onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))} disabled={currentPage === totalPages} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50">
                  Next
                </button>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Employee details</h2>
                <p className="text-sm text-slate-500">Open any row to review the selected profile.</p>
              </div>
              <div className="rounded-full bg-slate-100 p-2 text-slate-700">
                <UserRound className="h-4 w-4" />
              </div>
            </div>
            {activeEmployee ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{activeEmployee.name}</p>
                  <p className="text-sm text-slate-500">{activeEmployee.position}</p>
                </div>
                <div className="grid gap-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>Department</span>
                    <span className="font-medium text-slate-900">{activeEmployee.department}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>Email</span>
                    <span className="font-medium text-slate-900">{activeEmployee.email}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>Status</span>
                    <span className="font-medium text-slate-900">{activeEmployee.status}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>Joined</span>
                    <span className="font-medium text-slate-900">{activeEmployee.joinedDate}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select an employee to preview their profile.</p>
            )}
          </aside>
        </section>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add new employee</h3>
                <p className="text-sm text-slate-500">Create a record and add it to the directory instantly.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
                  <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
                  <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
                    {departments.filter((dept) => dept !== 'All Departments').map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EmployeeStatus }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
                    {statusOptions.filter((status) => status !== 'All Statuses').map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Position</label>
                <input required value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save employee</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
