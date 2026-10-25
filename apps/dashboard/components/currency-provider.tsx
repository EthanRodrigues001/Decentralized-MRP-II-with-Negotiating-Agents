"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_CURRENCY, formatCompact, formatMoney, type CurrencyConfig } from "@/lib/currency";

// Display currency comes from Settings. Money is stored in USD; every screen formats through here.

interface Ctx {
  cfg: CurrencyConfig;
  money: (usd: number | string | null | undefined, digits?: number) => string;
  compact: (usd: number) => string;
}

const CurrencyContext = createContext<Ctx>({
  cfg: DEFAULT_CURRENCY,
  money: (v, d) => formatMoney(v, DEFAULT_CURRENCY, d),
  compact: (v) => formatCompact(v, DEFAULT_CURRENCY),
});

export const SETTINGS_CHANGED = "settings-changed";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<CurrencyConfig>(DEFAULT_CURRENCY);

  const load = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings && setCfg({ currency: d.settings.displayCurrency, usdToInr: d.settings.usdToInr }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, state is set after the await
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => window.removeEventListener(SETTINGS_CHANGED, load);
  }, [load]);

  const value = useMemo<Ctx>(
    () => ({ cfg, money: (v, d) => formatMoney(v, cfg, d), compact: (v) => formatCompact(v, cfg) }),
    [cfg]
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useMoney() {
  return useContext(CurrencyContext);
}
