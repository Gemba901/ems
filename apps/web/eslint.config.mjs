import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { uiDriftRules } from "./scripts/ui-drift-rules.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}", "components/*/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}", "components/{Sidebar,Header,NotificationsBell}.tsx"],
    ignores: ["components/{ui,patterns,templates}/**"],
    plugins: { "ui-drift": { rules: uiDriftRules } },
    rules: Object.fromEntries(Object.keys(uiDriftRules).map((name) => [`ui-drift/${name}`, "warn"])),
  },
  {
    // Phase 6 lock-in: every migrated module fails on UI drift. Leave and Steel
    // Manufacturing are outside the rollout and stay on the baseline (warn).
    files: ["app/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}", "components/*/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}", "components/{Sidebar,Header,NotificationsBell}.tsx"],
    ignores: ["components/{ui,patterns,templates}/**", "{app,components}/{leave,steel}/**"],
    rules: Object.fromEntries(Object.keys(uiDriftRules).map((name) => [`ui-drift/${name}`, "error"])),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
