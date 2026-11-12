import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { resetMockServer, setMockLatency, tamperWithLoan } from "./api/mockServer";

function openApp(query: string) {
  window.history.replaceState(null, "", `/${query}`);
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const amountField = () => screen.getByLabelText("Amount received");
const confirmButton = () => screen.getByRole("button", { name: /^Confirm/ });
const scheduleTable = () => screen.getByRole("table", { name: "Repayment schedule" });
const rowFor = (number: number) =>
  within(scheduleTable())
    .getAllByRole("row")
    .find((row) => within(row).queryByRole("rowheader", { name: String(number) }))!;

beforeEach(() => {
  resetMockServer();
  setMockLatency(0);
});

afterEach(() => {
  setMockLatency(null);
});

describe("Repayment console: the brief's example", () => {
  it("shows a loading state, then the loan with derived statuses", async () => {
    openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    expect(screen.getByText("Loading loan…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Adaeze Okafor" })).toBeInTheDocument();
    // Overdue is said in words, not only with colour.
    expect(within(rowFor(1)).getByText("Overdue")).toBeInTheDocument();
    expect(within(rowFor(1)).getByText("42 days late")).toBeInTheDocument();
    expect(within(rowFor(3)).getByText("Upcoming")).toBeInTheDocument();
  });

  it("previews ₦250,000.00 exactly as the brief does, then posts it", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });

    await user.type(amountField(), "250000");
    expect(screen.getByTestId("amount-words")).toHaveTextContent("Two hundred and fifty thousand naira only");

    const allocation = screen.getByRole("table", { name: "Allocation" });
    const [, first, second] = within(allocation).getAllByRole("row");
    const cells = (row: HTMLElement | undefined) =>
      within(row!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    // Penalty, interest, principal (fee isn't reached, so its column is hidden), then still owed.
    expect(cells(first)).toEqual(["500.00", "18,000.00", "192,630.26", "Cleared"]);
    expect(cells(second)).toEqual(["0.00", "15,110.55", "23,759.19", "171,760.52"]);
    expect(screen.getByText("Unapplied credit").nextSibling).toHaveTextContent("₦0.00");

    const journal = screen.getByRole("table", { name: "Journal entry" });
    const lines = within(journal)
      .getAllByRole("row")
      .map((row) => [...row.children].map((cell) => cell.textContent));
    expect(lines).toEqual([
      ["Account", "Debit (₦)", "Credit (₦)"],
      ["DrCashAsset", "250,000.00", ""],
      ["CrPenalty IncomeIncome", "", "500.00"],
      ["CrInterest ReceivableAsset", "", "33,110.55"],
      ["CrLoans ReceivableAsset", "", "216,389.45"],
      ["Total", "250,000.00", "250,000.00"],
    ]);
    expect(screen.getByTestId("balance-indicator")).toHaveTextContent("Balanced");

    await user.click(confirmButton());
    expect(await screen.findByText(/as journal entry/)).toHaveTextContent("₦250,000.00 posted");
    expect(within(rowFor(1)).getByText("Paid")).toBeInTheDocument();
    expect(within(rowFor(2)).getByText("171,760.52")).toBeInTheDocument();
    expect(amountField()).toHaveValue("");
  });

  it("marks which schedule rows the typed payment reaches", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });
    await user.type(amountField(), "250000");
    expect(within(rowFor(1)).getByText(/This payment covers/)).toBeInTheDocument();
    expect(within(rowFor(3)).queryByText(/This payment covers/)).not.toBeInTheDocument();
  });
});

describe("Confirm button", () => {
  it("is disabled until a valid, non-zero amount is entered, and says why", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });

    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveAccessibleDescription("Enter the amount the customer paid.");

    await user.type(amountField(), "0");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than zero.");

    await user.clear(amountField());
    await user.type(amountField(), "12.345");
    expect(confirmButton()).toBeDisabled();

    await user.clear(amountField());
    await user.type(amountField(), "100");
    expect(confirmButton()).toBeEnabled();
    expect(confirmButton()).toHaveTextContent("Confirm ₦100.00");
  });

  it("is disabled for a fully paid loan", async () => {
    openApp("?loan=LN-2026-0129&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Bisi Adeyemi" });
    expect(confirmButton()).toBeDisabled();
    expect(amountField()).toBeDisabled();
    expect(confirmButton()).toHaveAccessibleDescription(/fully paid/);
  });

  it("fills the amount from a quick-fill chip", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });
    await user.click(screen.getByRole("button", { name: /Everything due/ }));
    expect(amountField()).toHaveValue("421,760.52");
    expect(screen.getByText("Unapplied credit").nextSibling).toHaveTextContent("₦0.00");
  });
});

describe("Edge cases", () => {
  it("warns that an overpayment becomes unapplied credit and posts it as a liability", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });
    await user.type(amountField(), "500000");
    expect(screen.getByText(/more than what's due now/)).toHaveTextContent("₦78,239.48");
    const journal = screen.getByRole("table", { name: "Journal entry" });
    expect(within(journal).getByText("Unapplied Credit")).toBeInTheDocument();
    await user.click(confirmButton());
    await screen.findByText(/as journal entry/);
    expect(screen.getByText("Customer credit").nextSibling).toHaveTextContent("₦78,239.48");
  });

  it("shows PARTIAL for an instalment due on the as-of date with something paid", async () => {
    openApp("?loan=LN-2026-0377&asOf=2026-11-15");
    await screen.findByRole("heading", { name: "Emeka Nwosu" });
    expect(within(rowFor(4)).getByText("Partial")).toBeInTheDocument();
    expect(within(rowFor(3)).getByText("Overdue")).toBeInTheDocument();
  });

  it("explains when nothing is due yet", async () => {
    const user = openApp("?loan=LN-2026-0533&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Ngozi Eze" });
    await user.type(amountField(), "1000");
    expect(screen.getByText(/Nothing is due as of the as-of date/)).toBeInTheDocument();
  });

  it("shows an empty state for a loan with no schedule", async () => {
    openApp("?loan=LN-2026-0561&asOf=2026-11-11");
    expect(await screen.findByText("No repayment schedule yet")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

describe("Network states", () => {
  it("shows an error with a retry that works", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11&scenario=flaky");
    expect(await screen.findByText("Couldn't load this loan")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveFocus();
    await user.click(retry);
    expect(await screen.findByRole("heading", { name: "Adaeze Okafor" })).toBeInTheDocument();
  });

  it("keeps failing in the 'always fail' scenario", async () => {
    const user = openApp("?loan=LN-2026-0418&scenario=error");
    await screen.findByText("Couldn't load this loan");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Couldn't load this loan")).toBeInTheDocument();
  });

  it("retries a failed post safely: the payment lands once", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11&scenario=flaky");
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Adaeze Okafor" });

    await user.type(amountField(), "1000");
    await user.click(confirmButton());
    expect(await screen.findByText(/didn't respond/)).toBeInTheDocument();
    expect(screen.getByText(/won't post twice/)).toBeInTheDocument();

    await user.click(confirmButton());
    await screen.findByText(/as journal entry/);
    expect(within(rowFor(1)).getByText("1,000.00")).toBeInTheDocument();
  });

  it("refuses to post if the loan changed after the preview", async () => {
    const user = openApp("?loan=LN-2026-0418&asOf=2026-11-11");
    await screen.findByRole("heading", { name: "Adaeze Okafor" });
    await user.type(amountField(), "1000");
    tamperWithLoan("LN-2026-0418", (json) => {
      const instalments = json.instalments as { penalty: { paid: string } }[];
      instalments[0]!.penalty.paid = "50000";
    });
    await user.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/loan changed since you opened it/),
    );
    // The preview reloads: the penalty is now paid, so the ₦1,000 goes to interest instead.
    expect(await screen.findByText(/preview now shows the latest figures/)).toBeInTheDocument();
    const allocation = screen.getByRole("table", { name: "Allocation" });
    expect(within(allocation).queryByRole("columnheader", { name: "Penalty" })).not.toBeInTheDocument();
    expect(within(allocation).getByRole("columnheader", { name: "Interest" })).toBeInTheDocument();
    // Confirming the refreshed preview posts.
    await user.click(confirmButton());
    expect(await screen.findByText(/as journal entry/)).toBeInTheDocument();
  });
});
