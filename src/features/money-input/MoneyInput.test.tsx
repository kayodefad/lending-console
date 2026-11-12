import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { parseNaira } from "../../domain/money";
import { MoneyInput } from "./MoneyInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MoneyInput label="Amount received" value={value} onChange={setValue} />
      <output data-testid="kobo">{String(parseNaira(value))}</output>
    </>
  );
}

const field = () => screen.getByLabelText("Amount received") as HTMLInputElement;
const kobo = () => screen.getByTestId("kobo").textContent;

describe("MoneyInput", () => {
  it("is labelled and groups thousands as you type", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "1200000.50");
    expect(field()).toHaveValue("1,200,000.50");
    expect(kobo()).toBe("120000050");
  });

  it("keeps the caret where you type in the middle", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "1234567");
    expect(field()).toHaveValue("1,234,567");
    // Put the caret after "1," and type two digits.
    field().setSelectionRange(2, 2);
    await user.keyboard("98");
    expect(field()).toHaveValue("198,234,567");
    expect(field().selectionStart).toBe(3);
  });

  it("Backspace after a comma removes the digit, not just the comma", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "1234");
    field().setSelectionRange(2, 2); // "1,|234"
    await user.keyboard("{Backspace}");
    expect(field()).toHaveValue("234");
  });

  it("accepts a pasted ₦1,200.00", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.paste("₦1,200.00");
    expect(field()).toHaveValue("1,200.00");
    expect(kobo()).toBe("120000");
  });

  it.each([
    ["1.234", "Use at most two decimal places (kobo)."],
    ["1e3", "Exponents like 1e3 aren't allowed. Type the full amount."],
    ["-50", "Amount can't be negative."],
    ["12abc", "Use digits only. Letters aren't allowed."],
    ["1.2.3", "Use only one decimal point."],
  ])("shows an inline error for %s and keeps the text as typed", async (typed, message) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), typed);
    expect(field()).toHaveValue(typed);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(field()).toHaveAccessibleDescription(message);
    expect(kobo()).toBe("null");
  });

  it("clears the error once the text is fixed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "1.234");
    await user.keyboard("{Backspace}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-invalid");
    expect(kobo()).toBe("123");
  });
});
