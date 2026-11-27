"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { AlertRegister } from "../components/AlertRegister";

export default function AbnormalitiesRoute() {
  return <ProtectedRoute><AlertRegister kind="abnormalities" /></ProtectedRoute>;
}
