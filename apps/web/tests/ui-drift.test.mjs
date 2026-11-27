import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  ruleFilter: ({ ruleId }) => ruleId.startsWith("ui-drift/"),
});

async function check(code, filePath = "app/leave/example.tsx") {
  const [result] = await eslint.lintText(code, { filePath });
  assert.equal(result.errorCount, 0);
  return result.messages.map(({ ruleId }) => ruleId).sort();
}

test("reports each scoped violation", async () => {
  assert.deepEqual(await check(`
    import WorkCard from "@/components/work/WorkCard";
    export const example = (
      <div className={cn("fixed", "inset-0", "hover:bg-blue-600")}
           style={{ color: "#eee" }}>
        <button>Save</button>
      </div>
    );
  `), [
    "ui-drift/cross-module-import",
    "ui-drift/inline-modal",
    "ui-drift/literal-colour",
    "ui-drift/native-control",
    "ui-drift/palette-class",
  ]);
});

test("allows semantic tokens, same-module imports and shared controls", async () => {
  assert.deepEqual(await check(`
    import LeaveCard from "../../components/leave/LeaveCard";
    import { Button } from "@/components/ui/button";
    export const example = (
      <Button className="bg-primary text-primary-foreground" href="/docs#abcdef">
        Save
      </Button>
    );
  `), []);
});

test("excludes shared kit files from module lint rules", async () => {
  assert.deepEqual(await check("export const example = <button />;", "components/ui/example.tsx"), []);
});

test("checks relative imports, re-exports and lazy module imports", async () => {
  assert.deepEqual(await check(`
    export { WorkCard } from "../work/WorkCard";
    export const load = () => import("@/components/work/WorkCard");
  `, "components/leave/example.tsx"), [
    "ui-drift/cross-module-import",
    "ui-drift/cross-module-import",
  ]);
});
