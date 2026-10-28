import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const tones = ["success", "warning", "info", "danger", "neutral"];
const brand = Object.fromEntries(
  [...css.matchAll(/--(color-gemba-[\w-]+):\s*([^;]+);/g)].map(
    ([, key, value]) => [key, value],
  ),
);

function luminance(value, tokens) {
  if (value.startsWith("var("))
    return luminance(
      tokens[value.slice(6, -1)] ?? brand[value.slice(6, -1)],
      tokens,
    );
  if (value.startsWith("#")) {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  const [L, C, hue] = value.match(/[\d.]+/g).map(Number);
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return (
    0.2126 * Math.max(0, Math.min(1, r)) +
    0.7152 * Math.max(0, Math.min(1, g)) +
    0.0722 * Math.max(0, Math.min(1, blue))
  );
}
function contrast(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const mode of [":root", ".dark"]) {
  const block = css.slice(css.indexOf(`${mode} {`)).split("}")[0];
  const tokens = Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
  test(`${mode} brand primary uses Gemba colours and has AA text contrast`, () => {
    const ratio = contrast(
      luminance(tokens.primary, tokens),
      luminance(tokens["primary-foreground"], tokens),
    );
    assert.ok(ratio >= 4.5, `Primary contrast: ${ratio.toFixed(2)}:1`);
    assert.equal(
      tokens.primary,
      mode === ":root" ? "var(--color-gemba-navy)" : "var(--color-gemba-lime)",
    );
    console.log(`${mode} primary: ${ratio.toFixed(2)}:1`);
  });
  for (const tone of tones) {
    test(`${mode} ${tone}: normal text has AA contrast on base and subtle backgrounds`, () => {
      for (const suffix of ["", "-foreground", "-subtle"]) {
        assert.ok(tokens[tone + suffix], `Missing ${tone + suffix}`);
        assert.ok(
          css.includes(`--color-${tone + suffix}: var(--${tone + suffix});`),
          `Missing Tailwind mapping`,
        );
      }
      const base = luminance(tokens[tone], tokens);
      const onBase = contrast(
        base,
        luminance(tokens[`${tone}-foreground`], tokens),
      );
      const onSubtle = contrast(
        base,
        luminance(tokens[`${tone}-subtle`], tokens),
      );
      assert.ok(onBase >= 4.5, `Foreground/base: ${onBase.toFixed(2)}:1`);
      assert.ok(onSubtle >= 4.5, `Base/subtle: ${onSubtle.toFixed(2)}:1`);
      console.log(
        `${mode} ${tone}: ${onBase.toFixed(2)}:1 foreground/base, ${onSubtle.toFixed(2)}:1 base/subtle`,
      );
    });
  }
}
