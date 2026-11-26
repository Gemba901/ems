import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { uiDriftRules } from "./scripts/ui-drift-rules.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}", "components/*/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}"],
    ignores: ["components/{ui,patterns,templates}/**"],
    plugins: { "ui-drift": { rules: uiDriftRules } },
    rules: Object.fromEntries(Object.keys(uiDriftRules).map((name) => [`ui-drift/${name}`, "warn"])),
  },
  {
    files: [
      "{app,components}/{sga,sims,five-s,tickets,dwms,work,hr,ems,admin,settings}/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}",
      "components/profile/MyProfileView.tsx",
      "components/employee-import/ColumnMappingDialog.tsx",
      "app/docs/dwms/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}",
    ],
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
