import { describe, expect, it } from "vitest";

/**
 * Belt and braces next to the ESLint rules: scan every non-test source file in
 * the money path for float operations. If someone disables the lint rule, this
 * still fails.
 */
const sources = import.meta.glob(
  ["./domain/**/*.ts", "./features/**/*.{ts,tsx}", "./api/**/*.ts", "./App.tsx"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const BANNED: [RegExp, string][] = [
  [/\bparseFloat\s*\(/, "parseFloat"],
  [/\.toFixed\s*\(/, "toFixed"],
  [/(?<![.\w])Number\s*\(/, "Number()"],
  [/\bMath\.round\s*\(/, "Math.round"],
];

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("money path", () => {
  const files = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path));

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s has no float operations", (_path, code) => {
    const clean = stripComments(code);
    for (const [pattern, name] of BANNED) {
      expect(pattern.test(clean), `${name} found`).toBe(false);
    }
  });
});
