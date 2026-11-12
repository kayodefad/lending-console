# Notes

## Assumptions

- **No fixture was supplied.** I asked HR; they said to work with the brief. I worked back from the brief's example: ₦1,200,000 at 1.5% a month over 6 months gives equal instalments of ₦210,630.26, and instalments 1–2 come out exactly as the brief shows them (interest 1,800,000 / 1,511,055, principal 19,263,026 / 19,551,971). `scripts/make-fixtures.mjs` builds that loan and four more for the other states. The app only reads the JSON; it never computes a schedule.
- **Fixture shape:** each component is `{ "due": "…", "paid": "…" }` in kobo strings. A missing component means nothing was due, in JSON and in the domain functions (instalments built by hand without `fee` or `penalty` work). `parseInstalments` validates a bare instalment array; `parseLoan` validates a whole loan. Instalments are expected to carry a `number`, used to break ties between equal due dates.
- **Status:** I implemented the brief's first-match order literally. A part-paid instalment past its due date is OVERDUE, not PARTIAL. PARTIAL only applies on the due date itself.
- **Oldest first** means by due date; instalments due the same day are ordered by number. Input order is never trusted.
- **Nothing eligible:** a payment when nothing is due becomes entirely unapplied credit. It's allowed but clearly warned. Confirm is disabled for an empty schedule (nothing to collect against), as well as for invalid, zero or fully paid.
- **Input:** `12.` (= ₦12.00) and `.99` are accepted, and so is a leading ₦ or "NGN". Commas are optional, but `parseNaira` rejects misplaced ones (`1,20,000`, `0,500`). The field regroups as you type, so the officer never has to fix commas by hand. `parseNaira` has no size limit; the console field alone caps entry at 15 naira digits.
- **Rounding:** none needed. Every operation is integer addition, subtraction or comparison.
- **Accounting:** interest is credited to Interest Receivable because it was accrued when the instalment fell due. Penalty and fee go straight to income, as the brief specifies.
- **as-of** is today's local calendar date. The date picker in the demo bar is a reviewer tool; in production this would be the server's business date.

## Verified by hand

- The brief's example in the browser: ₦250,000.00 → instalment 1 cleared, instalment 2 receives 1,511,055 interest + 2,375,919 principal, still owed 17,176,052, journal Dr 25,000,000 = Cr 50,000 + 3,311,055 + 21,638,945, Balanced. Posting it updates the schedule and the totals.
- Caret: typing into the middle of `1,234,567`, Backspace next to a comma, and deleting the first digit of `1,000,000` (the zeros stay, so typing `2` gives `2,000,000`). Pasting `₦1,200.00`. Each rejection message.
- Overpayment (unapplied credit line and warning), the PARTIAL loan on 15 Nov, nothing due yet, fully paid, empty schedule.
- Slow, always-failing and fail-once loads; a failed post retried with the same idempotency key, landing once; a loan changed after the preview (the server returns 409, the app reloads the loan, the preview updates, and confirming again posts).
- At 360px wide, the page doesn't scroll sideways (tables scroll inside labelled regions). Also keyboard-only use.

## Not done / next

- No end-to-end browser tests (Playwright). The flows are covered by Testing Library against the real mock server.
- No persistence: a reload resets the mock.
- No receipt print or export, and no reversal of a posted entry. In a real system a mistaken posting is fixed with a reversing entry, not an edit.
- `npm audit` reports a moderate advisory in a dev-only dependency (minimatch, via lint tooling). Production dependencies have 0 advisories.
