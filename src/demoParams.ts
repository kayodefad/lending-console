import { useCallback, useSyncExternalStore } from "react";
import { isIsoDate, todayIsoDate, type IsoDate } from "./domain/dates";
import { SCENARIOS, type Scenario } from "./api/mockServer";

/**
 * Demo controls live in the URL so any state can be shared or reproduced:
 *   ?loan=LN-2026-0377&asOf=2026-11-15&scenario=slow
 * asOf defaults to today. Overriding it is a demo tool: in production it
 * would be the server's business date, not something an officer picks.
 */
export interface DemoParams {
  readonly loanId: string;
  readonly asOf: IsoDate;
  readonly asOfOverridden: boolean;
  readonly scenario: Scenario;
}

export const DEFAULT_LOAN_ID = "LN-2026-0418";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("demo-params", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("demo-params", callback);
  };
}

const getSearch = () => window.location.search;

export function readDemoParams(search: string, today: IsoDate = todayIsoDate()): DemoParams {
  const params = new URLSearchParams(search);
  const asOfParam = params.get("asOf");
  const scenarioParam = params.get("scenario");
  const asOfOverridden = isIsoDate(asOfParam);
  return {
    loanId: params.get("loan") || DEFAULT_LOAN_ID,
    asOf: asOfOverridden ? asOfParam : today,
    asOfOverridden,
    scenario: SCENARIOS.includes(scenarioParam as Scenario) ? (scenarioParam as Scenario) : "normal",
  };
}

export function useDemoParams() {
  const search = useSyncExternalStore(subscribe, getSearch, getSearch);
  const params = readDemoParams(search);

  const update = useCallback((patch: Partial<Record<"loan" | "asOf" | "scenario", string | null>>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    window.history.pushState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    window.dispatchEvent(new Event("demo-params"));
  }, []);

  return { params, update };
}
