import { groupThousands, stripCurrencyPrefix } from "../../domain/money";

export interface Edit {
  readonly text: string;
  /** Caret position (selectionStart) in `text`. */
  readonly caret: number;
}

const SIGNIFICANT = /[\d.]/;

function countSignificant(text: string, end: number): number {
  let count = 0;
  for (let i = 0; i < end && i < text.length; i++) {
    if (SIGNIFICANT.test(text[i] ?? "")) count += 1;
  }
  return count;
}

function positionAfterSignificant(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (SIGNIFICANT.test(text[i] ?? "")) seen += 1;
    if (seen === count) return i + 1;
  }
  return text.length;
}

/**
 * Re-groups the thousands in what the officer typed and keeps the caret next
 * to the same digit, so typing in the middle never jumps to the end.
 *
 * Text that can't become a valid amount (letters, a minus sign, a second dot,
 * a third decimal, an exponent) is returned untouched, so the officer sees
 * exactly what they typed next to the error.
 */
export function formatWhileTyping(edit: Edit): Edit {
  const { text, caret } = edit;
  const body = stripCurrencyPrefix(text);
  if (body === "" || !/^[\d,]*\.?\d{0,2}$/.test(body)) {
    return edit;
  }
  // Characters stripped from the front (spaces, ₦, NGN) shift the caret left.
  const prefixLength = text.length - text.trimStart().length + (text.trim().length - body.length);

  const dot = body.indexOf(".");
  const rawInteger = (dot === -1 ? body : body.slice(0, dot)).replaceAll(",", "");
  const fraction = dot === -1 ? null : body.slice(dot + 1);

  // Drop leading zeros before a real digit ("007" → "7", "0,500" → "500"). If the
  // integer is all zeros, keep them as typed: deleting the "1" from "1,000,000"
  // must leave "000000", not collapse to "0" and lose six digits.
  const allZeros = /^0+$/.test(rawInteger);
  const integer = allZeros ? rawInteger : rawInteger.replace(/^0+(?=\d)/, "");
  const droppedZeros = rawInteger.length - integer.length;

  const grouped = allZeros ? integer : groupThousands(integer);
  const next = grouped + (fraction === null ? "" : `.${fraction}`);

  const caretInBody = Math.max(0, caret - prefixLength);
  const significantBefore = Math.max(0, countSignificant(body, caretInBody) - droppedZeros);
  return { text: next, caret: positionAfterSignificant(next, significantBefore) };
}

/**
 * Backspace or Delete next to a comma would only remove the comma, and the
 * re-grouping would put it straight back, so the key would seem to do nothing.
 * Instead, delete the digit on the far side of the comma.
 */
export function deleteAcrossComma(previous: Edit, direction: "backward" | "forward"): Edit | null {
  const { text, caret } = previous;
  if (direction === "backward" && text[caret - 1] === "," && caret >= 2) {
    return { text: text.slice(0, caret - 2) + text.slice(caret), caret: caret - 2 };
  }
  if (direction === "forward" && text[caret] === "," && caret + 1 < text.length) {
    return { text: text.slice(0, caret) + text.slice(caret + 2), caret };
  }
  return null;
}
