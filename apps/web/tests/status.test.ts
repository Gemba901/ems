import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  STATUS_TONE_MAP,
  STATUS_TONE_CLASSES,
  statusToTone,
  statusBadgeClass,
} from "../lib/status";
import {
  statusToSemantic,
  statusBadgeClass as legacyBadgeClass,
  STATUS_SEMANTIC_MAP,
  SEMANTIC_BADGE_CLASSES,
} from "../lib/steelStatusColors";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(webRoot, "../..");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function assertMapped(value: string, source: string) {
  assert.ok(
    Object.hasOwn(STATUS_TONE_MAP, value.trim().toUpperCase()),
    `${source}: add ${value} to lib/status.ts`,
  );
}
function stringLiterals(node: ts.TypeNode | undefined): string[] {
  if (!node) return [];
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(stringLiterals);
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
    return [node.literal.text];
  return [];
}

test("all Prisma lifecycle enums and string status defaults have explicit tones", () => {
  let enums = 0;
  for (const file of files(join(repoRoot, "packages/db/prisma/schema")).filter(
    (path) => path.endsWith(".prisma"),
  )) {
    const source = readFileSync(file, "utf8");
    for (const [, name, body] of source.matchAll(
      /enum\s+(\w+)\s*\{([^}]+)\}/g,
    )) {
      if (
        !/(Status|State)$/.test(name) &&
        !["AttendanceLocationCheck", "FiveSRoutineOutcome"].includes(name)
      )
        continue;
      enums++;
      for (const line of body.split("\n")) {
        const member = line.split("//")[0].trim();
        if (member && !member.startsWith("@@"))
          assertMapped(member.split(/\s/)[0], name);
      }
    }
    for (const [, value] of source.matchAll(
      /\bstatus\s+String\??\s+@default\("([^"\n]+)"\)/g,
    ))
      assertMapped(value, file);
  }
  assert.ok(enums >= 35, "Schema inventory must not silently become empty");
});

test("frontend declared status/state unions, enums and inline status fields are covered", () => {
  let checked = 0;
  for (const file of [
    ...files(join(webRoot, "services")),
    ...files(join(webRoot, "types")),
  ].filter((path) => path.endsWith(".ts"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      let values: string[] = [];
      if (
        ts.isTypeAliasDeclaration(node) &&
        (/(Status|State)$/.test(node.name.text) ||
          node.name.text === "LocationCheck")
      )
        values = stringLiterals(node.type);
      if (ts.isEnumDeclaration(node) && /(Status|State)$/.test(node.name.text))
        values = node.members.map((member) =>
          member.initializer && ts.isStringLiteral(member.initializer)
            ? member.initializer.text
            : member.name.getText(source),
        );
      if (
        ts.isPropertySignature(node) &&
        /^(status|state)$/.test(node.name.getText(source).replace(/["']/g, ""))
      )
        values = stringLiterals(node.type);
      for (const value of values) {
        // `""` in a status union is a "no filter" sentinel for filter state, not a status.
        if (value === "") continue;
        checked++;
        assertMapped(value, file);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(checked > 100, "Frontend inventory must not silently become empty");
});

test("backend string-backed status assignments are covered (including ingestion and onboarding)", () => {
  let checked = 0;
  for (const file of files(join(repoRoot, "apps/api/src")).filter(
    (path) => path.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(path),
  )) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source).replace(/["']/g, "") === "status" &&
        ts.isStringLiteral(node.initializer) &&
        /^[A-Z][A-Z0-9_]*$/.test(node.initializer.text)
      ) {
        checked++;
        assertMapped(node.initializer.text, file);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(checked > 50, "Backend inventory must not silently become empty");
});

test("review, failure, partial work and successful closure retain meaningful distinctions", () => {
  for (const value of [
    "PENDING",
    "PENDING_VERIFICATION",
    "PARTLY_DONE",
    "DONE_WITH_EXCEPTION",
    "LOW_ACCURACY",
  ])
    assert.equal(statusToTone(value), "warning");
  for (const value of ["DOWN", "REJECTED", "FAILED", "OVERDUE"])
    assert.equal(statusToTone(value), "danger");
  for (const value of ["VERIFIED_CLOSED", "APPROVED", "DONE", "ON_TRACK"])
    assert.equal(statusToTone(value), "success");
  assert.equal(statusToTone("MELTING"), "info");
  assert.equal(statusToTone("ACTIVE"), "info");
  assert.equal(statusToTone("ARCHIVED"), "neutral");
});

test("legacy casing is normalized; unknown and prototype strings are safe", () => {
  assert.equal(statusToTone(" approved "), "success");
  assert.equal(statusToTone("Active"), "info");
  for (const value of [
    undefined,
    null,
    "",
    "NEW_UNRECOGNIZED_STATE",
    "__proto__",
    "constructor",
    "toString",
  ]) {
    assert.equal(statusToTone(value), "neutral");
    assert.equal(statusBadgeClass(value), STATUS_TONE_CLASSES.neutral);
  }
});

test("Steel compatibility retains its public API and existing status meanings", () => {
  const original = {
    DRAFT: "NEUTRAL",
    IN_PROGRESS: "INFO",
    ON_HOLD: "WARNING",
    CLOSED: "SUCCESS",
    RELEASED: "SUCCESS",
    CANCELLED: "ERROR",
    REJECTED: "ERROR",
    PO_ISSUED: "INFO",
    READY: "SUCCESS",
    MAINTENANCE: "WARNING",
    DOWN: "ERROR",
    RETIRED: "NEUTRAL",
    MELTING: "INFO",
  } as const;
  for (const [status, semantic] of Object.entries(original)) {
    assert.equal(statusToSemantic(status), semantic);
    assert.equal(STATUS_SEMANTIC_MAP[status], semantic);
    assert.equal(legacyBadgeClass(status), statusBadgeClass(status));
    assert.equal(SEMANTIC_BADGE_CLASSES[semantic], statusBadgeClass(status));
  }
  assert.equal(statusToSemantic("UNKNOWN"), "NEUTRAL");
  assert.ok(Object.isFrozen(STATUS_TONE_MAP));
});
