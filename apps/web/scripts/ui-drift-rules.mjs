import { dirname, relative, resolve, sep } from "node:path";

const controls = new Set(["button", "input", "select", "textarea", "table"]);
const palette = /(?:^|[\s:])!?-?(?:bg|text|border(?:-[xysetbrl])?|ring(?:-offset)?|outline|decoration|divide|shadow|inset-shadow|drop-shadow|accent|caret|placeholder|fill|stroke|from|via|to)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d{2,3})(?=$|[\s/!])/;
const colour = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\(/i;
const classHelpers = new Set(["cn", "clsx", "classnames", "cva", "twMerge"]);

export function moduleName(path) {
  const [root, section] = path.split("/");
  if (root === "components") {
    if (["Sidebar.tsx", "Header.tsx", "NotificationsBell.tsx"].includes(section)) return "shell";
    return section;
  }
  if (section === "(dashboard)" || !section || section.includes(".")) return "dashboard";
  return section.replace(/^\((.+)\)$/, "$1");
}

function rule(message, create) {
  return { meta: { messages: { violation: message } }, create };
}

function stylingContext(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "JSXAttribute") return parent.name.name;
    if (parent.type === "Property" && [parent.key.name, parent.key.value].includes("className")) return "className";
    if (parent.type === "CallExpression" && classHelpers.has(parent.callee.name)) return "className";
    if (parent.type === "JSXElement" || parent.type.endsWith("Statement")) break;
  }
}

function inspectStrings(inspect) {
  return {
    Literal(node) {
      if (typeof node.value === "string") inspect(node, node.value);
    },
    TemplateElement(node) {
      inspect(node, node.value.raw);
    },
  };
}

function styleRule(message, check) {
  return rule(message, (context) => inspectStrings((node, value) => {
    if (check(stylingContext(node), value)) {
      context.report({ node, messageId: "violation" });
    }
  }));
}

const sharedInfrastructure = new Set([
  "components/Header",
  "components/Sidebar",
  "components/NotificationsBell",
  "components/ModuleGuard",
  "components/auth/ProtectedRoute",
  "components/files/TenantImage",
  "components/profile/MyProfileView",
  "components/employee-import/ColumnMappingDialog",
  "components/files/TenantFileLink",
  "components/onboarding/ModuleTour",
  "components/onboarding/tours",
  "components/shell/ModuleSidebar",
]);

function componentImportRule(context) {
  const root = context.cwd;
  const sourceModule = moduleName(relative(root, context.filename).split(sep).join("/"));
  function inspect(node) {
    const specifier = node?.value;
    if (typeof specifier !== "string") return;
    const target = specifier.startsWith("@/")
      ? resolve(root, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(context.filename), specifier)
        : null;
    if (!target) return;
    const targetPath = relative(root, target).split(sep).join("/");
    if (sharedInfrastructure.has(targetPath.replace(/\.[cm]?[jt]sx?$/, ""))) return;
    const [directory, targetModule, ...parts] = targetPath.split("/");
    if (
      directory === "components" && targetModule &&
      (parts.length || !targetModule.includes(".")) &&
      !["ui", "patterns", "templates", sourceModule].includes(targetModule)
    ) {
      context.report({ node, messageId: "violation" });
    }
  }
  return {
    ImportDeclaration: ({ source }) => inspect(source),
    ExportNamedDeclaration: ({ source }) => inspect(source),
    ExportAllDeclaration: ({ source }) => inspect(source),
    ImportExpression: ({ source }) => inspect(source),
    CallExpression(node) {
      if (node.callee.name === "require") inspect(node.arguments[0]);
    },
  };
}

export const uiDriftRules = {
  "native-control": rule("Use the shared frontend kit control.", (context) => ({
    JSXOpeningElement(node) {
      if (node.name.type === "JSXIdentifier" && controls.has(node.name.name)) {
        context.report({ node: node.name, messageId: "violation" });
      }
    },
  })),
  "literal-colour": styleRule("Use a semantic colour token.", (attribute, value) =>
    (attribute === "className" || attribute === "style") && colour.test(value)),
  "palette-class": styleRule("Use a semantic Tailwind colour utility.", (attribute, value) =>
    attribute === "className" && palette.test(value)),
  "inline-modal": rule("Use the shared Dialog or Sheet for fixed overlays.", (context) => ({
    "JSXAttribute:exit"(node) {
      if (node.name.name !== "className" || !node.value) return;
      const classes = context.sourceCode.getTokens(node.value)
        .filter((token) => ["String", "JSXText", "Template"].includes(token.type))
        .flatMap((token) => token.value.split(/[\s"`'{}]+/));
      if (classes.includes("fixed") && classes.includes("inset-0")) {
        context.report({ node, messageId: "violation" });
      }
    },
  })),
  "cross-module-import": rule("Use your module’s components or request a shared kit component.", componentImportRule),
};
