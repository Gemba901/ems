"use client";

import { useState } from "react";
import { EmployeeProfileData } from "@/types/employee";
import { User, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface InfoGridProps {
  employee: EmployeeProfileData;
  canEdit?: boolean;
  onSave?: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) => Promise<void>;
}

export const InfoGrid = ({ employee, canEdit, onSave }: InfoGridProps) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email ?? "",
    phone: employee.phone === "—" ? "" : employee.phone,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5 block">
        {label}
      </label>
      <Input
        type={type}
        value={form[key]}
        onChange={(e) => {
          const val = key === "phone"
            ? e.target.value.replace(/^\+/, "")
            : e.target.value;
          setForm((f) => ({ ...f, [key]: val }));
        }}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );

  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-foreground">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-bold tracking-widest uppercase">Personal Information</h3>
        </div>
        {canEdit && !editing && (
          <Button variant="ghost"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-info transition-colors h-auto whitespace-normal"
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("First Name", "firstName")}
            {field("Last Name", "lastName")}
          </div>
          {field("Email Address", "email", "email")}
          {field("Phone Number", "phone", "tel")}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg border border-border h-auto whitespace-normal"
            >
              Cancel
            </Button>
            <Button variant="ghost"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-info text-info-foreground rounded-lg hover:bg-info disabled:opacity-50 h-auto whitespace-normal"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
          {[
            { label: "First Name", value: employee.firstName },
            { label: "Last Name", value: employee.lastName },
            { label: "Email Address", value: employee.email ?? "—", fullWidth: true },
            { label: "Phone Number", value: employee.phone },
            { label: "Employment Type", value: employee.employmentType },
          ].map((item) => (
            <div key={item.label} className={"fullWidth" in item && item.fullWidth ? "col-span-2" : ""}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5">
                {item.label}
              </div>
              <div className="text-sm font-medium text-foreground break-all">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
