import { useCallback, useEffect, useState } from "react";
import { parseLoan, type Loan } from "../domain/loan";
import { ApiError, fetchLoan, type Scenario } from "./mockServer";

export type LoanState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly loan: Loan };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === "LoanDataError") {
    return `The loan data from the server is invalid: ${error.message}`;
  }
  return "Something went wrong while loading the loan.";
}

const LOADING: LoanState = { status: "loading" };

/**
 * Loads one loan. A plain effect is enough here: one request on open, a retry
 * button, and an abort when the officer switches loan so a slow response for
 * the old loan can never overwrite the new one.
 *
 * Each result is stored with the request it answers. Anything that doesn't
 * match the current request reads as "loading", so there's no stale flash.
 */
export function useLoan(loanId: string, scenario: Scenario) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${loanId}|${scenario}|${attempt}`;
  const [result, setResult] = useState<{ key: string; state: LoanState } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchLoan(loanId, { signal: controller.signal, scenario })
      .then((json) => ({ status: "ready", loan: parseLoan(json) }) as const)
      .catch((error: unknown) => ({ status: "error", message: describeError(error) }) as const)
      .then((state) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, state });
      });
    return () => controller.abort();
  }, [loanId, scenario, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Replace the loan with the server's copy after a posting. */
  const replaceLoan = useCallback(
    (json: unknown) => {
      let state: LoanState;
      try {
        state = { status: "ready", loan: parseLoan(json) };
      } catch (error) {
        state = { status: "error", message: describeError(error) };
      }
      setResult({ key: requestKey, state });
    },
    [requestKey],
  );

  const state = result?.key === requestKey ? result.state : LOADING;
  return { state, retry, replaceLoan };
}
