"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  CommitteeService,
  SteeringCommittee,
  CommitteeType,
  CreateCommitteePayload,
} from "@/services/committee.service";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Trash2,
  UserPlus,
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const COMMITTEE_TYPE_LABELS: Record<CommitteeType, string> = {
  QUALITY:    "Quality",
  COST:       "Cost",
  DELIVERY:   "Delivery",
  SAFETY:     "Safety",
  MORALE:     "Morale",
  TECHNOLOGY: "Technology",
  GENERAL:    "General",
};

const COMMITTEE_TYPE_BADGE: Record<CommitteeType, string> = {
  QUALITY:    "bg-info-subtle text-info",
  COST:       "bg-success-subtle text-success",
  DELIVERY:   "bg-primary/10 text-primary",
  SAFETY:     "bg-danger-subtle text-danger",
  MORALE:     "bg-warning-subtle text-warning",
  TECHNOLOGY: "bg-primary/10 text-primary",
  GENERAL:    "bg-muted text-muted-foreground",
};

const ALL_TYPES: CommitteeType[] = [
  "QUALITY", "COST", "DELIVERY", "SAFETY", "MORALE", "TECHNOLOGY", "GENERAL",
];

export default function CommitteesPage() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.roleLevel;
  const isAdmin = role === Role.SUPER_ADMIN || role === Role.ADMIN;

  // Create committee form
  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState("");
  const [newType, setNewType]         = useState<CommitteeType>("GENERAL");
  const [createError, setCreateError] = useState<string | null>(null);

  // Add member panel
  const [addingTo, setAddingTo]       = useState<string | null>(null);
  const [addError, setAddError]       = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  // Expanded committee
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: committees = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["committees"],
    queryFn: () => CommitteeService.list(accessToken!),
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as any).message : null;

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["employees-all", user?.organizationId],
    queryFn: () => EmployeeService.getByOrganization(user!.organizationId!, accessToken!, 1, 200),
    enabled: !!accessToken && !!user?.organizationId && !!addingTo,
  });

  const employees: EmployeeApiResponse[] = empData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: CreateCommitteePayload) => CommitteeService.create(payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["committees"] });
      setNewName("");
      setNewType("GENERAL");
      setShowCreate(false);
    },
    onError: (e: any) => setCreateError(e.message),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ committeeId, employeeId }: { committeeId: string; employeeId: string }) =>
      CommitteeService.addMember(committeeId, employeeId, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["committees"] });
      setAddingTo(null);
      setMemberSearch("");
    },
    onError: (e: any) => setAddError(e.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ committeeId, employeeId }: { committeeId: string; employeeId: string }) =>
      CommitteeService.removeMember(committeeId, employeeId, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["committees"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => CommitteeService.deleteCommittee(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["committees"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateError(null);
    createMutation.mutate({ name: newName.trim(), type: newType });
  };

  const handleAddMember = (committeeId: string, employeeId: string) => {
    setAddError(null);
    addMemberMutation.mutate({ committeeId, employeeId });
  };

  const handleRemoveMember = (committeeId: string, employeeId: string) => {
    removeMemberMutation.mutate({ committeeId, employeeId });
  };

  const handleDeleteCommittee = (id: string) => {
    deleteMutation.mutate(id);
  };

  const creating = createMutation.isPending;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Employees not yet in a given committee
  const availableEmployees = (committee: SteeringCommittee) => {
    const memberIds = new Set(committee.members.map((m) => m.employeeId));
    return employees.filter((e) => {
      if (memberIds.has(e.id)) return false;
      if (!memberSearch) return true;
      const q = memberSearch.toLowerCase();
      return (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.department?.name ?? "").toLowerCase().includes(q)
      );
    });
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT]}>
      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Committees</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage committees and their members across the organization.
            </p>
          </div>
          {isAdmin && (
            <Button variant="ghost"
              onClick={() => { setShowCreate((v) => !v); setCreateError(null); }}
              className="flex items-center gap-2 bg-info hover:bg-info text-info-foreground px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm shrink-0 h-auto whitespace-normal"
            >
              <Plus className="h-4 w-4" />
              New Committee
            </Button>
          )}
        </div>

        {/* Create form */}
        {showCreate && isAdmin && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-4">Create Committee</h2>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
              <Input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Committee name..."
                className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
              />
              <NativeSelect
                value={newType}
                onChange={(e) => setNewType(e.target.value as CommitteeType)}
                className="border border-border rounded-xl px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>{COMMITTEE_TYPE_LABELS[t]}</option>
                ))}
              </NativeSelect>
              <div className="flex gap-2">
                <Button variant="ghost"
                  type="submit"
                  disabled={creating}
                  className="bg-info hover:bg-info disabled:opacity-60 text-info-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors h-auto whitespace-normal"
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
                <Button variant="ghost"
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="border border-border hover:bg-muted text-muted-foreground px-4 py-2.5 rounded-xl text-sm transition-colors h-auto whitespace-normal"
                >
                  Cancel
                </Button>
              </div>
            </form>
            {createError && (
              <p className="mt-3 text-xs text-danger bg-danger-subtle border border-danger/20 rounded-lg px-3 py-2">{createError}</p>
            )}
          </div>
        )}

        {/* Committee list */}
        {loading && <p className="text-sm text-muted-foreground">Loading committees...</p>}
        {!loading && error && (
          <p className="text-sm text-danger bg-danger-subtle px-4 py-3 rounded-xl border border-danger/20">{error}</p>
        )}

        {!loading && !error && committees.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-12 shadow-sm text-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No committees yet</p>
              {isAdmin && (
                <p className="text-xs">Create a committee and assign members from your organization.</p>
              )}
            </div>
          </div>
        )}

        {!loading && !error && committees.map((committee) => {
          const isExpanded = expanded.has(committee.id);
          const badge      = COMMITTEE_TYPE_BADGE[committee.type];
          const typeLabel  = COMMITTEE_TYPE_LABELS[committee.type];
          const isAddingHere = addingTo === committee.id;

          return (
            <div key={committee.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

              {/* Committee header row */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{committee.name}</p>
                    <span className={`inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badge}`}>
                      {typeLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {committee.members.length} member{committee.members.length !== 1 ? "s" : ""}
                  </span>
                  {isAdmin && (
                    <>
                      <Button variant="ghost"
                        onClick={() => {
                          setAddingTo(isAddingHere ? null : committee.id);
                          setAddError(null);
                          setMemberSearch("");
                          if (!isExpanded) toggleExpand(committee.id);
                        }}
                        className="flex items-center gap-1.5 border border-border hover:bg-muted text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors h-auto whitespace-normal"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Add Member
                      </Button>
                      <Button variant="ghost"
                        onClick={() => handleDeleteCommittee(committee.id)}
                        className="p-1.5 text-muted-foreground hover:text-danger hover:bg-danger-subtle rounded-lg transition-colors h-auto whitespace-normal"
                        title="Delete committee"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost"
                    onClick={() => toggleExpand(committee.id)}
                    className="p-1.5 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition-colors h-auto whitespace-normal"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Add member panel */}
              {isAddingHere && isAdmin && (
                <div className="px-5 pb-4 border-t border-border">
                  <div className="pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Add Member</p>
                    <Input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search by name, email, or department..."
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all mb-2"
                    />
                    {addError && (
                      <p className="text-xs text-danger bg-danger-subtle border border-danger/20 rounded-lg px-3 py-2 mb-2">{addError}</p>
                    )}
                    {empLoading ? (
                      <p className="text-xs text-muted-foreground py-2">Loading employees...</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {availableEmployees(committee).slice(0, 20).map((emp) => (
                          <Button variant="ghost"
                            key={emp.id}
                            onClick={() => handleAddMember(committee.id, emp.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-info-subtle text-left transition-colors group h-auto whitespace-normal"
                          >
                            <div className="h-7 w-7 rounded-full bg-info-subtle text-info flex items-center justify-center text-[10px] font-bold shrink-0">
                              {emp.firstName[0]}{emp.lastName[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {emp.firstName} {emp.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {emp.department?.name ?? "No department"}
                              </p>
                            </div>
                            <UserPlus className="h-3.5 w-3.5 text-info opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                          </Button>
                        ))}
                        {availableEmployees(committee).length === 0 && (
                          <p className="text-xs text-muted-foreground px-3 py-2">No matching employees found.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Members list */}
              {isExpanded && (
                <div className="border-t border-border">
                  {committee.members.length === 0 ? (
                    <div className="px-5 py-6 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="h-6 w-6 text-primary-foreground" />
                        <p className="text-xs">No members yet. Add employees to this committee.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {committee.members.map((m) => (
                        <div key={m.employeeId} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-info-subtle text-info flex items-center justify-center text-[10px] font-bold shrink-0">
                              {m.employee.firstName[0]}{m.employee.lastName[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {m.employee.firstName} {m.employee.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.employee.department?.name ?? "No department"}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <Button variant="ghost"
                              onClick={() => handleRemoveMember(committee.id, m.employeeId)}
                              className="p-1.5 text-muted-foreground hover:text-danger hover:bg-danger-subtle rounded-lg transition-colors shrink-0 ml-2 h-auto whitespace-normal"
                              title="Remove from committee"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ProtectedRoute>
  );
}
