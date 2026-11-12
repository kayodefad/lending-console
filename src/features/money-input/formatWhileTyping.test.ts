import { describe, expect, it } from "vitest";
import { deleteAcrossComma, formatWhileTyping } from "./formatWhileTyping";

/** "12|34" → { text: "1234", caret: 2 }. The bar marks the caret. */
const at = (marked: string) => ({ text: marked.replace("|", ""), caret: marked.indexOf("|") });
const show = ({ text, caret }: { text: string; caret: number }) =>
  `${text.slice(0, caret)}|${text.slice(caret)}`;
const fmt = (marked: string) => show(formatWhileTyping(at(marked)));

describe("formatWhileTyping", () => {
  it("groups thousands as you type at the end", () => {
    expect(fmt("1234|")).toBe("1,234|");
    expect(fmt("1234567|")).toBe("1,234,567|");
    expect(fmt("1,234,5678|")).toBe("12,345,678|");
  });

  it("keeps the caret beside the digit just typed in the middle", () => {
    expect(fmt("1,9|234,567")).toBe("19|,234,567");
    expect(fmt("19,8|234,567")).toBe("198|,234,567");
    expect(fmt("1|00")).toBe("1|00");
    expect(fmt("12|5,000")).toBe("12|5,000");
  });

  it("re-groups after a deletion without jumping to the end", () => {
    // Deleting "9" from "1,9|34,567" leaves "1,|34,567": re-grouped, the caret stays after "1".
    expect(fmt("1,|34,567")).toBe("1|34,567");
    expect(fmt("|234,567")).toBe("|234,567");
  });

  it("leaves decimals alone and keeps a trailing dot while typing", () => {
    expect(fmt("1200.|")).toBe("1,200.|");
    expect(fmt("1200.5|")).toBe("1,200.5|");
    expect(fmt("1200.50|")).toBe("1,200.50|");
    expect(fmt(".9|")).toBe(".9|");
  });

  it("drops leading zeros but keeps the zero before a dot", () => {
    expect(fmt("007|")).toBe("7|");
    expect(fmt("0.5|")).toBe("0.5|");
    expect(fmt("0|")).toBe("0|");
    expect(fmt("0,500|")).toBe("500|");
  });

  it("deleting the first digit keeps the zeros, so the next digit restores the amount", () => {
    // Backspace after the "1" in "1|,000,000" leaves "|,000,000".
    expect(fmt("|,000,000")).toBe("|000000");
    expect(fmt("|,000,000.50")).toBe("|000000.50");
    // Typing "2" there gives back a full amount.
    expect(fmt("2|000000")).toBe("2|,000,000");
  });

  it("cleans up a pasted amount with a currency symbol", () => {
    expect(fmt("₦1,200.00|")).toBe("1,200.00|");
    expect(fmt("NGN 1200|")).toBe("1,200|");
    expect(fmt("  ₦250000.00|")).toBe("250,000.00|");
  });

  it.each(["1.234|", "12a|", "-5|", "1e3|", "1.2.3|", "1 000|"])(
    "returns invalid text %s untouched so the officer sees what they typed",
    (marked) => {
      expect(fmt(marked)).toBe(marked);
    },
  );
});

describe("deleteAcrossComma", () => {
  it("Backspace just after a comma deletes the digit before it", () => {
    expect(deleteAcrossComma(at("1,|234"), "backward")).toEqual(at("|234"));
    expect(deleteAcrossComma(at("12,|345"), "backward")).toEqual(at("1|345"));
  });

  it("Delete just before a comma deletes the digit after it", () => {
    expect(deleteAcrossComma(at("1|,234"), "forward")).toEqual(at("1|34"));
  });

  it("does nothing when the caret isn't next to a comma", () => {
    expect(deleteAcrossComma(at("12|34"), "backward")).toBeNull();
    expect(deleteAcrossComma(at("1234|"), "forward")).toBeNull();
  });
});
