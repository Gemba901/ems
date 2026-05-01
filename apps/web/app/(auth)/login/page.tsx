"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IdentifierStep } from "../../../components/auth/IdentifierStep";
import { SetupStep } from "../../../components/auth/SetupStep";
import { LoginStep } from "../../../components/auth/LoginStep";
import { OrgPickerStep } from "../../../components/auth/OrgPickerStep";

export type AuthState = {
  identifier: string;
  name?: string;
  orgName?: string;
  setupToken?: string;
  organizations?: { id: string; name: string }[];
  selectionToken?: string;
};

function AnimatedGear({
  id,
  x,
  y,
  size,
  duration,
  direction,
  opacity = 0.09,
  color = "#ffffff",
  teeth = 8,
}: {
  id: number;
  x: string;
  y: string;
  size: number;
  duration: number;
  direction: 1 | -1;
  opacity?: number;
  color?: string;
  teeth?: number;
}) {
  const maskId = `gear-mask-${id}`;
  const r = size / 2;
  const innerR = r * 0.72;
  const holeR = r * 0.28;
  const toothW = (2 * Math.PI * innerR) / (teeth * 2.5);
  const toothH = (r - innerR) * 1.15;

  return (
    <motion.div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
      }}
      animate={{ rotate: direction === 1 ? 360 : -360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <mask id={maskId}>
            <rect width={size} height={size} fill="white" />
            <circle cx={r} cy={r} r={holeR} fill="black" />
          </mask>
        </defs>
        {/* Gear body + teeth */}
        <g mask={`url(#${maskId})`} opacity={opacity} fill={color}>
          <circle cx={r} cy={r} r={innerR} />
          {Array.from({ length: teeth }).map((_, i) => (
            <rect
              key={i}
              x={r - toothW / 2}
              y={r - innerR - toothH + 2}
              width={toothW}
              height={toothH}
              rx={1.5}
              transform={`rotate(${(i * 360) / teeth}, ${r}, ${r})`}
            />
          ))}
        </g>
        {/* Hub detail */}
        <circle cx={r} cy={r} r={holeR * 0.55} fill={color} opacity={opacity * 0.5} />
        {/* Spoke ring */}
        <circle
          cx={r}
          cy={r}
          r={innerR * 0.6}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={opacity * 0.4}
        />
      </svg>
    </motion.div>
  );
}

const GEARS: Omit<Parameters<typeof AnimatedGear>[0], "id">[] = [
  { x: "7%",  y: "12%", size: 150, duration: 28, direction:  1, opacity: 0.09 },
  { x: "90%", y: "8%",  size: 95,  duration: 18, direction: -1, opacity: 0.07 },
  { x: "3%",  y: "74%", size: 190, duration: 35, direction: -1, opacity: 0.07 },
  { x: "93%", y: "68%", size: 115, duration: 24, direction:  1, opacity: 0.08 },
  { x: "50%", y: "3%",  size: 72,  duration: 14, direction: -1, opacity: 0.06 },
  { x: "78%", y: "90%", size: 105, duration: 22, direction:  1, opacity: 0.07, teeth: 10 },
  { x: "22%", y: "93%", size: 82,  duration: 17, direction: -1, opacity: 0.06 },
  { x: "66%", y: "16%", size: 62,  duration: 12, direction:  1, opacity: 0.05 },
  { x: "14%", y: "50%", size: 58,  duration: 15, direction:  1, opacity: 0.05 },
  { x: "86%", y: "44%", size: 68,  duration: 16, direction: -1, opacity: 0.06 },
  // green-tinted accent gears (echoing the logo)
  { x: "38%", y: "88%", size: 50,  duration: 11, direction:  1, opacity: 0.07, color: "#6ee7b7" },
  { x: "60%", y: "96%", size: 40,  duration: 9,  direction: -1, opacity: 0.06, color: "#6ee7b7" },
  { x: "96%", y: "30%", size: 45,  duration: 10, direction:  1, opacity: 0.06, color: "#6ee7b7" },
];

export default function AuthPage() {
  const [step, setStep] = useState<"IDENTIFY" | "SETUP" | "LOGIN" | "ORG_SELECT">("IDENTIFY");
  const [data, setData] = useState<AuthState>({ identifier: "" });

  return (
    <main
      className="min-h-screen flex items-center justify-center p-6 font-sans relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1a2744 0%, #0d1627 60%, #162040 100%)",
      }}
    >
      {/* Animated gear layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {GEARS.map((gear, i) => (
          <AnimatedGear key={i} id={i} {...gear} />
        ))}
      </div>

      {/* Radial depth vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(10,18,38,0.55) 100%)",
        }}
      />

      {/* Form card */}
      <div className="relative z-10">
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
              <SetupStep data={data} onComplete={() => setStep("LOGIN")} />
            )}

            {step === "LOGIN" && (
              <LoginStep
                data={data}
                onBack={() => setStep("IDENTIFY")}
                onOrgRequired={(orgs, selectionToken) => {
                  setData((d) => ({ ...d, organizations: orgs, selectionToken }));
                  setStep("ORG_SELECT");
                }}
              />
            )}

            {step === "ORG_SELECT" && (
              <OrgPickerStep data={data} onBack={() => setStep("LOGIN")} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
