import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatKobo, parseAmountEntry, parseKoboString, parseNaira, parseNairaInput, sumKobo } from "./money";

describe("parseNaira", () => {
  it.each([
    ["1,200,000.50", 120000050n],
    [".99", 99n],
    ["0.5", 50n],
    ["1200", 120000n],
    ["1200.5", 120050n],
    ["0", 0n],
    ["0.00", 0n],
    ["0.01", 1n],
    ["12.", 1200n],
    ["007", 700n],
    ["250,000.00", 25000000n],
    ["999", 99900n],
    ["1,000", 100000n],
  ])("%s → %s kobo (the brief's examples first)", (text, kobo) => {
    expect(parseNaira(text)).toBe(kobo);
  });

  it("returns null for empty input", () => {
    expect(parseNaira("")).toBeNull();
    expect(parseNaira("   ")).toBeNull();
    expect(parseNairaInput("").kind).toBe("empty");
  });

  it.each([
    ["₦1,200.00", 120000n],
    ["  ₦1,200.00  ", 120000n],
    ["₦ 1,200.00", 120000n],
    ["NGN 50", 5000n],
    ["ngn50.25", 5025n],
  ])("accepts a pasted currency prefix: %s", (text, kobo) => {
    expect(parseNaira(text)).toBe(kobo);
  });

  it.each([
    ["1.234", /two decimal places/],
    ["0.001", /two decimal places/],
    ["1e3", /Exponents/],
    ["1E3", /Exponents/],
    ["2e+5", /Exponents/],
    ["-5", /negative/],
    ["−5", /negative/],
    ["(500)", /negative/],
    ["abc", /Letters/],
    ["12a", /Letters/],
    ["1.2.3", /one decimal point/],
    ["1..2", /one decimal point/],
    ["1 000", /spaces/],
    ["1,20,000", /separate thousands/],
    ["1,2", /separate thousands/],
    [",100", /separate thousands/],
    ["1000,000", /separate thousands/],
    ["1.00,0", /after the decimal point/],
    [".", /Enter an amount/],
    ["₦", null],
    ["$100", /digits, commas/],
    ["1_000", /digits, commas/],
  ])("rejects %s with a clear message", (text, message) => {
    const result = parseNairaInput(text);
    if (message === null) {
      expect(result.kind).toBe("empty");
      return;
    }
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toMatch(message);
    expect(parseNaira(text)).toBeNull();
  });

  it("never returns a non-bigint", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const value = parseNaira(text);
        return value === null || (typeof value === "bigint" && value >= 0n);
      }),
    );
  });

  it("round-trips any kobo amount through formatKobo", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 17n - 1n }), (kobo) => {
        expect(parseNaira(formatKobo(kobo))).toBe(kobo);
        expect(parseNaira(formatKobo(kobo, { symbol: false }).replaceAll(",", ""))).toBe(kobo);
      }),
    );
  });

  it("handles amounts far beyond Number.MAX_SAFE_INTEGER without losing a kobo", () => {
    expect(parseNaira("999,999,999,999,999.99")).toBe(99999999999999999n);
    expect(parseNaira("12345678901234567890.12")).toBe(1234567890123456789012n);
    expect(parseNaira("1000000000000000")).toBe(100000000000000000n);
  });

  it("caps what the console accepts at 15 naira digits (a UI rule, not a parser rule)", () => {
    expect(parseAmountEntry("999999999999999.99")).toEqual({ kind: "ok", kobo: 99999999999999999n });
    const tooBig = parseAmountEntry("1234567890123456");
    expect(tooBig.kind === "error" && tooBig.message).toMatch(/too large/);
  });

  it("rejects a grouped number with a leading zero", () => {
    expect(parseNaira("0,500")).toBeNull();
    expect(parseNaira("00,500")).toBeNull();
    expect(parseNaira("0500")).toBe(50000n);
  });
});

describe("formatKobo", () => {
  it.each([
    [0n, "₦0.00"],
    [1n, "₦0.01"],
    [50n, "₦0.50"],
    [99n, "₦0.99"],
    [100n, "₦1.00"],
    [120000050n, "₦1,200,000.50"],
    [25000000n, "₦250,000.00"],
    [-500n, "-₦5.00"],
  ])("%s → %s", (kobo, text) => {
    expect(formatKobo(kobo)).toBe(text);
  });

  it("can leave out the symbol", () => {
    expect(formatKobo(19263026n, { symbol: false })).toBe("192,630.26");
  });

  it("refuses numbers, so a float can't sneak in at runtime", () => {
    // @ts-expect-error: deliberately passing a number
    expect(() => formatKobo(1.5)).toThrow(TypeError);
    // @ts-expect-error: deliberately passing a number
    expect(() => formatKobo(150)).toThrow(TypeError);
  });
});

describe("parseKoboString (fixture amounts)", () => {
  it("parses integer strings", () => {
    expect(parseKoboString("19263026", "x")).toBe(19263026n);
    expect(parseKoboString("0", "x")).toBe(0n);
  });

  it.each([[19263026], ["1.5"], ["-1"], ["01"], [""], [" 1"], [null], ["1e3"]])("rejects %j", (value) => {
    expect(() => parseKoboString(value, "amount")).toThrow(TypeError);
  });
});

describe("sumKobo", () => {
  it("adds bigints and rejects anything else", () => {
    expect(sumKobo([1n, 2n, 3n])).toBe(6n);
    // @ts-expect-error: deliberately mixing a number in
    expect(() => sumKobo([1n, 2])).toThrow(TypeError);
  });
});
