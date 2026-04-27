"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Box, Loader2 } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import Image from "next/image";

interface IdentifierStepProps {
  onSuccess: (data: {
    identifier: string;
    hasPassword: boolean;
    name?: string;
    orgName?: string;
    setupToken?: string;
  }) => void;
}

export function IdentifierStep({ onSuccess }: IdentifierStepProps) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null)

    try {
        const response = await AuthService.verifyIdentifier(identifier);

        onSuccess({
            identifier,
            hasPassword: response.hasPassword,
            name: response.name,
            orgName: response.orgName,
            setupToken: response.setupToken,
        });
    }catch (error: any) {
        setError(error.message || "Unable to verify account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full sm:w-[420px] p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
    >
      <div className="flex flex-col items-center mb-8">
        {/* use real logo */}
        <Image
          src="/logo.png"
          alt="GEMBA PMS"
          width={96}
          height={96}
        />

        
        <p className="text-sm text-slate-500 text-center">
          Enter your email or phone number to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => {
                setIdentifier(e.target.value)
                if (error) setError(null);
            }}
            placeholder="Email or phone number"
            className={`w-full px-4 py-3 bg-white border rounded-lg text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 ${
              error ? "border-red-500/50 focus:ring-red-500/20 focus:border-red-500" : "border-slate-200"
            }`}
          />
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center text-red-500 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
            {error}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={loading || !identifier}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 flex items-center justify-center"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center space-y-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">
          Security Layer: V2.4.0
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-500">
          <a href="#" className="hover:text-slate-800 transition-colors">
            Privacy Policy
          </a>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <a href="#" className="hover:text-slate-800 transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </motion.div>
  );
}
