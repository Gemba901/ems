"use client";

import { TenantImage } from "@/components/files/TenantImage";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmployeeProfileData } from "@/types/employee";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface IdentityCardProps {
  employee: EmployeeProfileData;
  canEditAvatar?: boolean;
  onAvatarSave?: (url: string) => Promise<void>;
}

export const IdentityCard = ({ employee, canEditAvatar, onAvatarSave }: IdentityCardProps) => {
  const [showAvatarInput, setShowAvatarInput] = useState(false);
  const [avatarInput, setAvatarInput] = useState(employee.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleAvatarSave = async () => {
    if (!onAvatarSave) return;
    setSaving(true);
    try {
      await onAvatarSave(avatarInput);
      setShowAvatarInput(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-center gap-6">
      <div className="relative group shrink-0">
        <div className="h-24 w-24 bg-primary rounded-2xl overflow-hidden">
          <TenantImage
            src={employee.avatarUrl ?? "/api/placeholder/100/100"}
            alt={employee.name}
            className="w-full h-full object-cover"
          />
        </div>
        {canEditAvatar && (
          <Button variant="ghost"
            onClick={() => setShowAvatarInput(true)}
            className="absolute inset-0 flex items-center justify-center bg-foreground/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity h-auto whitespace-normal"
            title="Update profile picture"
          >
            <Camera className="h-5 w-5 text-primary-foreground" />
          </Button>
        )}
        <div
          className={`absolute -bottom-1 -right-1 h-4 w-4 border-2 border-card rounded-full ${
            employee.status === "Active" ? "bg-success" : "bg-muted-foreground"
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-info font-mono mb-1">
          STAFF ID: {employee.employeeId}
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1 truncate">{employee.name}</h2>
        <p className="text-sm text-muted-foreground mb-3">{employee.role}</p>
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="bg-muted text-muted-foreground border-none w-fit">
            {employee.employmentType}
          </Badge>
          <p className="text-info text-xs">{employee.department}</p>
        </div>
      </div>

      <Dialog open={showAvatarInput} onOpenChange={setShowAvatarInput}>
          <DialogContent showCloseButton={false} className="block w-full max-w-sm gap-0 rounded-2xl bg-card p-6 shadow-xl ring-0 sm:max-w-sm">
            <DialogTitle className="text-sm font-bold text-foreground mb-1">Update Profile Picture</DialogTitle>
            <p className="text-xs text-muted-foreground mb-4">Paste a publicly accessible image URL.</p>
            <Input
              type="url"
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {avatarInput && (
              <div className="mb-4 rounded-xl overflow-hidden h-20 w-20 bg-muted border border-border">
                <TenantImage
                  src={avatarInput}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost"
                onClick={() => setShowAvatarInput(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg border border-border h-auto whitespace-normal"
              >
                Cancel
              </Button>
              <Button variant="ghost"
                onClick={handleAvatarSave}
                disabled={saving || !avatarInput.trim()}
                className="px-4 py-2 text-sm bg-info text-info-foreground rounded-lg hover:bg-info disabled:opacity-50 h-auto whitespace-normal"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
      </Dialog>
    </div>
  );
};
