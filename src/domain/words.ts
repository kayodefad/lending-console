import { assertKobo, KOBO_PER_NAIRA, type Kobo } from "./money";

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function underThousand(n: number): string {
  const hundreds = Math.trunc(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (rest > 0) {
    const restWords =
      rest < 20
        ? (ONES[rest] ?? "")
        : `${TENS[Math.trunc(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(hundreds > 0 ? `and ${restWords}` : restWords);
  }
  return parts.join(" ");
}

/** 120000n → "one thousand two hundred" (British style, as on Nigerian receipts). */
export function integerToWords(value: bigint): string {
  if (value === 0n) return "zero";
  const groups: number[] = [];
  let rest = value;
  while (rest > 0n) {
    // 0–999, an exact small integer used only to pick words.
    groups.push(Number.parseInt((rest % 1000n).toString(), 10));
    rest /= 1000n;
  }
  if (groups.length > SCALES.length) return value.toString();
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i] ?? 0;
    if (group === 0) continue;
    const chunk = underThousand(group);
    // "one million and five": British "and" before a final group under 100.
    const needsAnd = i === 0 && groups.length > 1 && group < 100;
    words.push(`${needsAnd ? "and " : ""}${chunk}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return words.join(", ").replace(/, and /g, " and ");
}

/** 25000000n → "Two hundred and fifty thousand naira only". Helps an officer catch an extra zero. */
export function koboToWords(kobo: Kobo): string {
  assertKobo(kobo);
  const naira = kobo / KOBO_PER_NAIRA;
  const rest = kobo % KOBO_PER_NAIRA;
  let text: string;
  if (naira === 0n && rest === 0n) text = "zero naira";
  else if (naira === 0n) text = `${integerToWords(rest)} kobo`;
  else if (rest === 0n) text = `${integerToWords(naira)} naira only`;
  else text = `${integerToWords(naira)} naira, ${integerToWords(rest)} kobo`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
