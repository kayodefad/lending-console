/**
 * Money in this app is always an integer number of kobo, held as a `bigint`.
 * ₦1 = 100 kobo. There is no float anywhere in this module: no parseFloat,
 * no Number() on decimals, no toFixed. ESLint enforces that for src/domain
 * (see eslint.config.js) and a test scans the money path for those tokens.
 */
export type Kobo = bigint;

export const KOBO_PER_NAIRA = 100n;

/**
 * Ceiling on what an officer can type into the console: 15 naira digits (just
 * under ₦1 quadrillion). A UI policy, so `parseNaira` itself has no limit.
 */
export const MAX_NAIRA_DIGITS = 15;

export interface ParseNairaOptions {
  /** Reject amounts with more naira digits than this. No limit by default. */
  readonly maxNairaDigits?: number;
}

export type NairaParseResult =
  | { readonly kind: "empty" }
  | { readonly kind: "ok"; readonly kobo: Kobo }
  | { readonly kind: "error"; readonly message: string };

const CURRENCY_PREFIX = /^(?:₦|NGN)\s*/i;
/** "1,200" or "12,345,678": a first group of 1–3 digits not starting with 0, then groups of 3. */
const GROUPED_INTEGER = /^[1-9]\d{0,2}(?:,\d{3})+$/;

/** Removes surrounding spaces and one leading "₦" or "NGN", as pasted from a statement. */
export function stripCurrencyPrefix(text: string): string {
  return text.trim().replace(CURRENCY_PREFIX, "");
}

/**
 * Parses naira text into kobo and explains why when it can't.
 *
 * Accepts: "1200", "1,200,000.50", ".99", "0.5", "12.", "₦1,200.00", "NGN 50".
 * Rejects: more than two decimals, exponents (1e3), negatives, letters,
 * several dots, spaces inside the number, and commas that aren't thousands
 * separators ("1,20,000"). Commas are optional, but if present they must be
 * correct, because a misplaced comma is usually a typo in an amount.
 */
export function parseNairaInput(text: string, options: ParseNairaOptions = {}): NairaParseResult {
  if (typeof text !== "string") {
    return { kind: "error", message: "Enter an amount." };
  }
  const body = stripCurrencyPrefix(text);
  if (body === "") return { kind: "empty" };

  if (body.includes("-") || body.includes("−") || body.startsWith("(")) {
    return { kind: "error", message: "Amount can't be negative." };
  }
  if (/\d\s*e\s*[+]?\d/i.test(body) || /^e/i.test(body)) {
    return { kind: "error", message: "Exponents like 1e3 aren't allowed. Type the full amount." };
  }
  if (/[a-z]/i.test(body)) {
    return { kind: "error", message: "Use digits only. Letters aren't allowed." };
  }
  if ((body.match(/\./g) ?? []).length > 1) {
    return { kind: "error", message: "Use only one decimal point." };
  }
  if (/\s/.test(body)) {
    return { kind: "error", message: "Remove the spaces inside the amount." };
  }
  if (/[^\d.,]/.test(body)) {
    return { kind: "error", message: "Use digits, commas and one decimal point only." };
  }

  const dot = body.indexOf(".");
  const integerPart = dot === -1 ? body : body.slice(0, dot);
  const fractionPart = dot === -1 ? "" : body.slice(dot + 1);

  if (fractionPart.includes(",")) {
    return { kind: "error", message: "Commas can't appear after the decimal point." };
  }
  if (fractionPart.length > 2) {
    return { kind: "error", message: "Use at most two decimal places (kobo)." };
  }
  if (integerPart.includes(",") && !GROUPED_INTEGER.test(integerPart)) {
    return { kind: "error", message: "Commas must separate thousands, e.g. 1,200,000." };
  }

  const digits = integerPart.replaceAll(",", "");
  if (digits === "" && fractionPart === "") {
    return { kind: "error", message: "Enter an amount." };
  }
  if (options.maxNairaDigits !== undefined && digits.replace(/^0+/, "").length > options.maxNairaDigits) {
    return { kind: "error", message: "That amount is too large." };
  }

  const naira = BigInt(digits === "" ? "0" : digits);
  const kobo = BigInt(fractionPart.padEnd(2, "0"));
  return { kind: "ok", kobo: naira * KOBO_PER_NAIRA + kobo };
}

/** What the console's amount field accepts: parseNairaInput with the entry limit. */
export function parseAmountEntry(text: string): NairaParseResult {
  return parseNairaInput(text, { maxNairaDigits: MAX_NAIRA_DIGITS });
}

/** "1,200,000.50" → 120000050n. Empty or invalid text → null. */
export function parseNaira(text: string): Kobo | null {
  const result = parseNairaInput(text);
  return result.kind === "ok" ? result.kobo : null;
}

export function assertKobo(value: unknown, label = "amount"): asserts value is Kobo {
  if (typeof value !== "bigint") {
    throw new TypeError(`${label} must be a bigint number of kobo, got ${typeof value}`);
  }
}

/** Inserts thousands separators into a string of digits: "1200000" → "1,200,000". */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatKoboOptions {
  /** Prefix with "₦". Default true. */
  readonly symbol?: boolean;
}

/** 120000050n → "₦1,200,000.50". Negative values get a leading minus: "-₦5.00". */
export function formatKobo(kobo: Kobo, options: FormatKoboOptions = {}): string {
  assertKobo(kobo);
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const naira = abs / KOBO_PER_NAIRA;
  const rest = abs % KOBO_PER_NAIRA;
  const body = `${groupThousands(naira.toString())}.${rest.toString().padStart(2, "0")}`;
  const symbol = options.symbol === false ? "" : "₦";
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/** Kobo as the plain decimal text an input would hold: 120000050n → "1200000.50". */
export function koboToInputText(kobo: Kobo): string {
  return formatKobo(kobo, { symbol: false });
}

export function sumKobo(values: Iterable<Kobo>): Kobo {
  let total = 0n;
  for (const value of values) {
    assertKobo(value);
    total += value;
  }
  return total;
}

export function minKobo(a: Kobo, b: Kobo): Kobo {
  return a < b ? a : b;
}

/** Parses a kobo amount serialised as a string ("19263026"). Throws on anything else. */
export function parseKoboString(value: unknown, label: string): Kobo {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(
      `${label} must be a non-negative integer kobo amount as a string, got ${JSON.stringify(value)}`,
    );
  }
  return BigInt(value);
}
