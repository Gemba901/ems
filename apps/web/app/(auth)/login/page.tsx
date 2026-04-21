"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IdentifierStep } from "../../../components/auth/IdentifierStep";
import { SetupStep } from "../../../components/auth/SetupStep";
import { LoginStep } from "../../../components/auth/LoginStep";

export type AuthState = {
  identifier: string;
  name?: string;
  orgName?: string;
  setupToken?: string;
};

export default function AuthPage() {
  const [step, setStep] = useState<"IDENTIFY" | "SETUP" | "LOGIN">("IDENTIFY");
  const [data, setData] = useState<AuthState>({ identifier: "" });

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F4F7FA] p-6 font-sans">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {step === "IDENTIFY" && (
            <IdentifierStep 
              onSuccess={(res) => {
                setData(res);
                setStep(res.setupToken ? "SETUP" : "LOGIN");
              }} 
            />
          )}

          {step === "SETUP" && (
            <SetupStep 
              data={data} 
              onComplete={() => setStep("LOGIN")} 
            />
          )}

          {step === "LOGIN" && (
            <LoginStep 
              data={data} 
              onBack={() => setStep("IDENTIFY")} 
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}