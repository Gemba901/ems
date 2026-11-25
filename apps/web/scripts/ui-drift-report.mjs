import { readFile, writeFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { moduleName } from "./ui-drift-rules.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = new URL("../ui-drift-baseline.json", import.meta.url);
const [mode, previousBaseline] = process.argv.slice(2);
if (
  ![undefined, "--write", "--check"].includes(mode) ||
  (previousBaseline && mode !== "--check") || process.argv.length > 4
) {
  throw new Error("Usage: ui-drift-report.mjs [--write | --check [previous-baseline.json]]");
}

const eslint = new ESLint({
  cwd: root,
  allowInlineConfig: false,
  overrideConfig: { linterOptions: { reportUnusedDisableDirectives: "off" } },
  ruleFilter: ({ ruleId }) => ruleId.startsWith("ui-drift/"),
});
const results = await eslint.lintFiles(["app", "components"]);
const counts = new Map();
const problems = [];
for (const result of results) {
  const file = relative(root, result.filePath).split(sep).join("/");
  for (const message of result.messages) {
    if (message.fatal || message.severity === 2) {
      problems.push(`${file}:${message.line} ${message.message}`);
    }
    if (!message.ruleId?.startsWith("ui-drift/")) continue;
    const key = `${moduleName(file)}/${message.ruleId.slice("ui-drift/".length)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}
if (problems.length) throw new Error(problems.join("\n"));

const current = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "en")));
const json = `${JSON.stringify(current, null, 2)}\n`;
if (mode === "--write") {
  await writeFile(baseline, json);
} else if (mode === "--check") {
  const committed = JSON.parse(await readFile(baseline, "utf8"));
  const previous = previousBaseline ? JSON.parse(await readFile(previousBaseline, "utf8")) : committed;
  const keys = new Set([...Object.keys(current), ...Object.keys(committed)]);
  for (const key of keys) {
    const actual = current[key] ?? 0;
    const expected = committed[key] ?? 0;
    const prior = previous[key] ?? 0;
    if (actual > prior || expected > prior || actual !== expected) {
      console.error(`${key}: found ${actual}, committed baseline ${expected}, allowed ${prior}`);
      process.exitCode = 1;
    }
  }
  if (process.exitCode) {
    console.error("Fix increases in UI drift. After reducing drift, run pnpm --filter web ui:drift --write.");
  } else {
    console.log(`UI drift matches the baseline across ${counts.size} module/rule pairs.`);
  }
} else {
  process.stdout.write(json);
}
