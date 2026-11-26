"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { AlertRegister } from "../components/AlertRegister";

export default function AlertsRoute() {
  return <ProtectedRoute><AlertRegister kind="alerts" /></ProtectedRoute>;
}
