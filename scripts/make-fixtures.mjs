// Generates the loan fixtures in src/api/fixtures/.
//
// The app never computes schedules (the brief says the server supplies them).
// This script plays the server: it builds equal-instalment (annuity) schedules
// in integer kobo with half-up rounding, the last instalment absorbing the
// rounding residue, then sets the penalties, fees and payments each scenario needs.
//
// Loan 1 reproduces the brief's example exactly: ₦1,200,000 at 1.5% a month
// over 6 months gives instalments of ₦210,630.26, and instalments 1–2 are
// interest 1,800,000 + principal 19,263,026 and interest 1,511,055 + principal 19,551,971.
//
// Run: node scripts/make-fixtures.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "api", "fixtures");

/** Half-up division for non-negative bigints. */
const roundDiv = (n, d) => (2n * n + d) / (2n * d);

/** Equal-instalment schedule. rate is per period as [numerator, denominator]. */
function annuity(principal, [num, den], dates) {
  const n = dates.length;
  const SCALE = 10n ** 30n;
  const r = (num * SCALE) / den;
  let growth = SCALE;
  for (let i = 0; i < n; i++) growth = (growth * (SCALE + r)) / SCALE;
  const discount = (SCALE * SCALE) / growth;
  const payment = roundDiv(principal * r, SCALE - discount);
  let balance = principal;
  return dates.map((dueDate, i) => {
    const interest = roundDiv(balance * num, den);
    const principalPart = i === n - 1 ? balance : payment - interest;
    balance -= principalPart;
    return {
      number: i + 1,
      dueDate,
      penalty: { due: 0n, paid: 0n },
      fee: { due: 0n, paid: 0n },
      interest: { due: interest, paid: 0n },
      principal: { due: principalPart, paid: 0n },
    };
  });
}

const payInFull = (inst) => {
  for (const key of ["penalty", "fee", "interest", "principal"]) inst[key].paid = inst[key].due;
};

const toJson = (loan) =>
  JSON.stringify(loan, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2) + "\n";

function write(name, loan) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.json`), toJson(loan));
  console.log(`wrote ${name}.json (${loan.instalments.length} instalments)`);
}

// 1. The brief's example. Instalments 1 and 2 are past due; nothing paid.
{
  const instalments = annuity(
    120_000_000n,
    [15n, 1000n],
    ["2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"],
  );
  instalments[0].penalty.due = 50_000n; // late-payment penalty on the first instalment
  write("LN-2026-0418", {
    id: "LN-2026-0418",
    customer: { name: "Adaeze Okafor" },
    product: "SME Working Capital",
    currency: "NGN",
    principal: 120_000_000n,
    interestRate: "1.5% per month",
    disbursedOn: "2026-08-31",
    unappliedCredit: 0n,
    instalments,
  });
}

// 2. Part-paid, with fees and penalties.
//    #1–2 paid; #3 overdue and part-paid; #4 has an early part-payment, so on
//    its due date (2026-11-15) it shows PARTIAL; #5–6 upcoming.
{
  const instalments = annuity(
    50_000_000n,
    [25n, 1000n],
    ["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"],
  );
  const [i1, i2, i3, i4] = instalments;
  i1.fee.due = 500_000n; // 1% management fee collected with the first instalment
  payInFull(i1);
  payInFull(i2);
  i3.penalty.due = 75_000n;
  i3.fee.due = 25_000n; // late-payment notice fee
  i3.penalty.paid = 75_000n;
  i3.fee.paid = 25_000n;
  i3.interest.paid = i3.interest.due;
  i3.principal.paid = 3_000_000n;
  i4.interest.paid = 400_000n; // customer paid part of the interest early
  write("LN-2026-0377", {
    id: "LN-2026-0377",
    customer: { name: "Emeka Nwosu" },
    product: "Personal Loan",
    currency: "NGN",
    principal: 50_000_000n,
    interestRate: "2.5% per month",
    disbursedOn: "2026-07-15",
    unappliedCredit: 0n,
    instalments,
  });
}

// 3. Fully paid, with ₦1,500 customer credit left on the loan.
{
  const instalments = annuity(9_000_000n, [3n, 100n], ["2026-06-20", "2026-07-20", "2026-08-20"]);
  instalments.forEach(payInFull);
  write("LN-2026-0129", {
    id: "LN-2026-0129",
    customer: { name: "Bisi Adeyemi" },
    product: "Salary Advance",
    currency: "NGN",
    principal: 9_000_000n,
    interestRate: "3% per month",
    disbursedOn: "2026-05-20",
    unappliedCredit: 150_000n,
    instalments,
  });
}

// 4. Empty schedule: booked, schedule not generated yet.
write("LN-2026-0561", {
  id: "LN-2026-0561",
  customer: { name: "Tunde Alabi" },
  product: "Asset Finance",
  currency: "NGN",
  principal: 350_000_000n,
  interestRate: "2% per month",
  disbursedOn: "2026-11-09",
  unappliedCredit: 0n,
  instalments: [],
});

// 5. Nothing due yet: every instalment is in the future, so a payment today
//    can only become unapplied credit.
{
  const instalments = annuity(
    200_000_000n,
    [2n, 100n],
    [
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
      "2027-04-01",
      "2027-05-01",
      "2027-06-01",
      "2027-07-01",
      "2027-08-01",
      "2027-09-01",
      "2027-10-01",
      "2027-11-01",
    ],
  );
  write("LN-2026-0533", {
    id: "LN-2026-0533",
    customer: { name: "Ngozi Eze" },
    product: "SME Working Capital",
    currency: "NGN",
    principal: 200_000_000n,
    interestRate: "2% per month",
    disbursedOn: "2026-11-01",
    unappliedCredit: 0n,
    instalments,
  });
}
