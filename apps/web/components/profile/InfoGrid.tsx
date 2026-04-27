import { EmployeeProfileData } from "@/types/employee";
import { User } from "lucide-react";

export const InfoGrid = ({ employee }: { employee: EmployeeProfileData }) => {
  const details = [
    { label: "Email Address", value: employee.email, fullWidth: true },
    { label: "Phone Number", value: employee.phone },
    { label: "Date of Birth", value: employee.dob },
    { label: "National ID", value: employee.nationalId },
    { label: "Primary Residence", value: employee.address, fullWidth: true },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 mb-6 text-slate-800">
        <User className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold tracking-widest uppercase">Personal Information</h3>
      </div>
      <div className="grid grid-cols-2 gap-y-6 gap-x-4">
        {details.map((item) => (
          <div key={item.label} className={item.fullWidth ? "col-span-2" : ""}>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mb-1.5">{item.label}</div>
            <div className="text-sm font-medium text-slate-900 break-all">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};