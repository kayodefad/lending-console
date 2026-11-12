# Repayment console

A lending back-office screen. An officer opens a loan, sees its schedule, types a customer payment, and sees exactly how the payment will be allocated and what journal entry it will post before confirming.

React 19 + TypeScript (strict) + Vite, styled with Tailwind CSS v4 and shadcn/ui (Radix primitives), set in Albert Sans. Tests use Vitest, Testing Library and fast-check. The server is mocked in the browser.

## Run it

Needs Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # all tests, once
```

Other scripts: `npm run check` (typecheck, lint, format check and tests), `npm run build`, `npm run test:watch`.

## Try it

The dashed **Demo** bar at the top isn't part of the officer UI. It picks a fixture loan, moves the as-of date and forces network states. Everything it sets is in the URL, so any state can be shared:

| URL                                   | What you see                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `/?loan=LN-2026-0418&asOf=2026-11-11` | The brief's example. Type `250000` to get its allocation and journal exactly.        |
| `/?loan=LN-2026-0377&asOf=2026-11-15` | Part-paid loan with fees and a penalty; instalment 4 is PARTIAL.                     |
| `/?loan=LN-2026-0533`                 | Nothing due yet, so a payment can only become unapplied credit.                      |
| `/?loan=LN-2026-0129`                 | Fully paid (Confirm disabled), with ₦1,500 customer credit.                          |
| `/?loan=LN-2026-0561`                 | Empty schedule.                                                                      |
| `&scenario=slow` · `error` · `flaky`  | 2.5 s latency · every request fails · the first load and first post fail, then work. |

`asOf` defaults to today. Fixture state lives in memory, so a full reload resets any payments you posted.

## Where things are

```
src/domain/          Pure logic, no React. All money is bigint kobo.
  money.ts           parseNaira, formatKobo, and the strict fixture-amount parser
  dates.ts           Calendar dates without Date parsing (no time-zone drift)
  loan.ts            Types, fixture validation, deriveStatus, totals
  allocation.ts      allocatePayment: the waterfall, with its proof
  journal.ts         buildPaymentJournal and summarizeJournal (balance check)
  words.ts           Amount in words, shown under the input
src/api/             Mock server (fixtures as JSON strings) and the useLoan hook
src/features/        MoneyInput (built on the shadcn Input), schedule table, payment panel, previews
src/components/ui/   shadcn/ui components, generated with the shadcn CLI. Table takes containerProps for scroll
                     regions; Badge and Alert have added status variants.
scripts/make-fixtures.mjs   Generates the fixtures (plays the server's schedule engine)
```

## Money rules are enforced in code

- Amounts are `bigint` kobo everywhere: in state, props and calculations. A float can't type-check, and `formatKobo`, `sumKobo` and `allocatePayment` throw a `TypeError` on a `number` at runtime.
- ESLint bans `parseFloat`, `Number()`, `toFixed`, `Math.round` and float literals in the money path (`eslint.config.js`). `src/money-path.test.ts` scans the same files, so the guarantee holds even if a lint rule is switched off.
- Fixture amounts must be integer strings. A JSON number, a decimal string or `paid > due` is rejected when the data is loaded.
- `allocatePayment` never mutates its input; the tests run it on deep-frozen data. It throws instead of returning a result where applied + unapplied ≠ payment.
- The journal's totals and its Balanced badge are computed from the lines that are displayed. The mock server rebuilds the entry itself and refuses to post if it's unbalanced or differs from what the officer previewed.

See `NOTES.md` for assumptions and what was checked by hand.
