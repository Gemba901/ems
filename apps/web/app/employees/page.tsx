"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
  Search, Plus, MoreHorizontal, Eye, Pencil,
  Building2, UserX, ShieldAlert, ChevronLeft, ChevronRight,
  X, Loader2, Mail, Phone, User, Briefcase,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";

// ── Role options visible per role level ─────────────────────────────────────

const ALL_ROLES = [
  { id: 5, label: "Employee" },
  { id: 4, label: "Head of Department" },
  { id: 3, label: "Management" },
  { id: 2, label: "Admin" },
  { id: 1, label: "Super Admin" },
];

function rolesForCurrentUser(currentRole: Role | undefined) {
  if (currentRole === Role.SUPER_ADMIN) return ALL_ROLES;
  if (currentRole === Role.ADMIN)       return ALL_ROLES.filter(r => r.id >= 3);
  return ALL_ROLES.filter(r => r.id === 5);
}

// ── Add Employee Drawer ──────────────────────────────────────────────────────

interface AddEmployeeDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (emp: EmployeeApiResponse) => void;
  orgId: string;
  token: string;
  currentRole: Role | undefined;
}

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function AddEmployeeDrawer({ open, onClose, onCreated, orgId, token, currentRole }: AddEmployeeDrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", departmentId: "", roleId: "5",
  });

  useEffect(() => {
    if (!open || !orgId) return;
    EmployeeService.getDepartments(orgId, token)
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [open, orgId, token]);

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setError("First and last name are required."); return; }
    if (!form.email.trim())  { setError("Email is required."); return; }
    if (!form.roleId)        { setError("Role is required."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        firstName:    form.firstName.trim(),
        lastName:     form.lastName.trim(),
        email:        form.email.trim(),
        roleId:       Number(form.roleId),
      };
      if (form.phone)        payload.phone        = form.phone.trim();
      if (form.departmentId) payload.departmentId = form.departmentId;

      const created = await EmployeeService.onboard(payload, token);
      onCreated(created);
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to add employee.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm({ firstName: "", lastName: "", email: "", phone: "", departmentId: "", roleId: "5" });
    setError(null);
    onClose();
  }

  const availableRoles = rolesForCurrentUser(currentRole);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex"
      onClick={e => { if (e.target === overlayRef.current) handleClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      <div className="relative ml-auto h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Add Employee</h2>
            <p className="text-xs text-slate-400 mt-0.5">Onboard a new team member to the organization</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  value={form.firstName}
                  onChange={e => set("firstName", e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="Jane"
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Last Name" required>
              <input
                value={form.lastName}
                onChange={e => set("lastName", e.target.value)}
                className={inputCls}
                placeholder="Doe"
              />
            </Field>
          </div>

          <Field label="Email Address" required>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="jane.doe@company.com"
              />
            </div>
          </Field>

          <Field label="Phone Number">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="tel"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="+254 700 000 000"
              />
            </div>
          </Field>

          <Field label="Department">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={form.departmentId}
                onChange={e => set("departmentId", e.target.value)}
                className={`${inputCls} pl-9 appearance-none`}
              >
                <option value="">No department assigned</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            {departments.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1">No departments found. You can assign one later.</p>
            )}
          </Field>

          <Field label="Role" required>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={form.roleId}
                onChange={e => set("roleId", e.target.value)}
                className={`${inputCls} pl-9 appearance-none`}
              >
                {availableRoles.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.label}</option>
                ))}
              </select>
            </div>
          </Field>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5">
              <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding...</>
            ) : (
              <><Plus className="h-3.5 w-3.5" /> Add Employee</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// ── Role-based menu items ────────────────────────────────────────────────────

type MenuItem =
  | { type: "item"; label: string; icon: React.ElementType; action: () => void; danger?: boolean }
  | { type: "divider" };

function buildMenuItems(
  _emp: EmployeeApiResponse,
  role: Role | undefined,
  onView: () => void,
): MenuItem[] {
  const isAdmin    = role === Role.SUPER_ADMIN || role === Role.ADMIN;
  const isManager  = isAdmin || role === Role.MANAGEMENT || role === Role.HOD;
  const isSuperAdmin = role === Role.SUPER_ADMIN;

  const items: MenuItem[] = [
    { type: "item", label: "View Profile",       icon: Eye,       action: onView },
  ];

  if (isManager) {
    items.push({ type: "item", label: "Edit Details",    icon: Pencil,    action: () => {} });
  }
  if (isAdmin) {
    items.push({ type: "item", label: "Change Department", icon: Building2, action: () => {} });
  }
  if (isAdmin) {
    items.push({ type: "divider" });
    items.push({ type: "item", label: "Deactivate Account", icon: UserX, action: () => {}, danger: true });
  }
  if (isSuperAdmin) {
    items.push({ type: "item", label: "Remove Employee", icon: ShieldAlert, action: () => {}, danger: true });
  }

  return items;
}

// ── Dropdown ─────────────────────────────────────────────────────────────────

function ActionMenu({
  emp,
  role,
  onClose,
}: {
  emp: EmployeeApiResponse;
  role: Role | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref    = useRef<HTMLDivElement>(null);

  const items = buildMenuItems(emp, role, () => {
    router.push(`/operations/employees/${emp.id}`);
    onClose();
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
    >
      {items.map((item, i) => {
        if (item.type === "divider") {
          return <div key={i} className="my-1 border-t border-slate-100" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              item.action();
              onClose();
            }}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
              item.danger
                ? "text-red-600 hover:bg-red-50"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TeamDirectoryPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [employees, setEmployees] = useState<EmployeeApiResponse[]>([]);
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);

  function handleEmployeeCreated(emp: EmployeeApiResponse) {
    setEmployees(prev => [emp, ...prev]);
  }

  const isAdmin   = role === Role.SUPER_ADMIN || role === Role.ADMIN;
  const isManager = isAdmin || role === Role.MANAGEMENT || role === Role.HOD;

  useEffect(() => {
    if (!user?.organizationId || !accessToken) return;
    setLoading(true);
    // Fetch all for client-side search + pagination
    EmployeeService.getByOrganization(user.organizationId, accessToken, 1, 500)
      .then((res) => setEmployees(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user?.organizationId, accessToken]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => {
      const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const dept = emp.department?.name.toLowerCase() ?? "";
      return name.includes(q) || dept.includes(q);
    });
  }, [employees, search]);

  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const uniqueDepartments = useMemo(
    () => new Set(employees.filter((e) => e.department).map((e) => e.department!.name)).size,
    [employees],
  );

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <AddEmployeeDrawer
        open={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        onCreated={handleEmployeeCreated}
        orgId={user?.organizationId ?? ""}
        token={accessToken ?? ""}
        currentRole={role}
      />

      <div className="max-w-7xl mx-auto w-full space-y-5">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Team Directory</h1>
            <p className="text-sm text-slate-500 mt-1">Manage and view team members across the organization.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-full sm:w-64"
              />
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowAddEmployee(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Employee
              </button>
            )}
          </div>
        </div>

        {/* Stats line — not in cards */}
        {!loading && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>
              <span className="font-semibold text-slate-800">{employees.length}</span>{" "}
              {employees.length === 1 ? "employee" : "employees"}
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-slate-800">{uniqueDepartments}</span>{" "}
              {uniqueDepartments === 1 ? "department" : "departments"}
            </span>
            {search && filtered.length !== employees.length && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{filtered.length} match your search</span>
              </>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider">Department</th>
                {isManager && (
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider">Role</th>
                )}
                <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700">
              {loading && (
                <tr>
                  <td colSpan={isManager ? 5 : 4} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Loading employees...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={isManager ? 5 : 4} className="px-6 py-12 text-center text-red-500 text-sm">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && paginated.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 5 : 4} className="px-6 py-12 text-center text-slate-400 text-sm">
                    {search ? "No employees match your search." : "No employees found."}
                  </td>
                </tr>
              )}

              {!loading && !error && paginated.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/operations/employees/${emp.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                        {getInitials(emp.firstName, emp.lastName)}
                      </div>
                      <span className="font-medium text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{emp.email}</td>
                  <td className="px-6 py-4">
                    {emp.department ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {emp.department.name}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {isManager && (
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500 capitalize">
                        {emp.user?.role?.name?.replace(/_/g, " ").toLowerCase() ?? "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === emp.id ? null : emp.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {openMenuId === emp.id && (
                        <ActionMenu
                          emp={emp}
                          role={role}
                          onClose={() => setOpenMenuId(null)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {!loading && !error && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} employees
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500 px-2 tabular-nums">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
