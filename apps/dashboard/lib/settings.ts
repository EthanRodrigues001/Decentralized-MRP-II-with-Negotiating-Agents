import { sql } from "@/lib/db";

export interface AppSettings {
  autoBuyThreshold: number;
  autoBuyEnabled: boolean;
  maxAutoSpendPerDay: number;
  /** Orders the production agent starts on its own each day (0 = none, except urgent ones). */
  dailyOrderLimit: number;
  displayCurrency: "USD" | "INR";
  /** Rupees per US dollar. All money is stored in USD; this only changes how it is shown. */
  usdToInr: number;
}

const KEYS = {
  autoBuyThreshold: "auto_buy_threshold",
  autoBuyEnabled: "auto_buy_enabled",
  maxAutoSpendPerDay: "max_auto_spend_per_day",
  dailyOrderLimit: "daily_order_limit",
  displayCurrency: "display_currency",
  usdToInr: "usd_to_inr",
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  autoBuyThreshold: 200,
  autoBuyEnabled: true,
  maxAutoSpendPerDay: 50000,
  dailyOrderLimit: 5,
  displayCurrency: "USD",
  usdToInr: 83,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = (await sql`SELECT key, value FROM settings`) as { key: string; value: unknown }[];
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => {
    const v = byKey.get(k);
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = byKey.get(k);
    return typeof v === "boolean" ? v : d;
  };
  return {
    autoBuyThreshold: num(KEYS.autoBuyThreshold, DEFAULT_SETTINGS.autoBuyThreshold),
    autoBuyEnabled: bool(KEYS.autoBuyEnabled, DEFAULT_SETTINGS.autoBuyEnabled),
    maxAutoSpendPerDay: num(KEYS.maxAutoSpendPerDay, DEFAULT_SETTINGS.maxAutoSpendPerDay),
    dailyOrderLimit: num(KEYS.dailyOrderLimit, DEFAULT_SETTINGS.dailyOrderLimit),
    displayCurrency: byKey.get(KEYS.displayCurrency) === "INR" ? "INR" : "USD",
    usdToInr: num(KEYS.usdToInr, DEFAULT_SETTINGS.usdToInr),
  };
}

export function validateSettingsPatch(input: unknown): Partial<AppSettings> | { error: string } {
  if (typeof input !== "object" || input === null) return { error: "body must be an object" };
  const o = input as Record<string, unknown>;
  const patch: Partial<AppSettings> = {};
  if ("autoBuyThreshold" in o) {
    const v = o.autoBuyThreshold;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000)
      return { error: "autoBuyThreshold must be an integer between 0 and 1,000,000" };
    patch.autoBuyThreshold = v;
  }
  if ("autoBuyEnabled" in o) {
    if (typeof o.autoBuyEnabled !== "boolean") return { error: "autoBuyEnabled must be a boolean" };
    patch.autoBuyEnabled = o.autoBuyEnabled;
  }
  if ("maxAutoSpendPerDay" in o) {
    const v = o.maxAutoSpendPerDay;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      return { error: "maxAutoSpendPerDay must be a non-negative number" };
    patch.maxAutoSpendPerDay = v;
  }
  if ("dailyOrderLimit" in o) {
    const v = o.dailyOrderLimit;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1000)
      return { error: "dailyOrderLimit must be a whole number between 0 and 1000" };
    patch.dailyOrderLimit = v;
  }
  if ("displayCurrency" in o) {
    if (o.displayCurrency !== "USD" && o.displayCurrency !== "INR") return { error: "displayCurrency must be USD or INR" };
    patch.displayCurrency = o.displayCurrency;
  }
  if ("usdToInr" in o) {
    const v = o.usdToInr;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 10_000) return { error: "usdToInr must be a positive number" };
    patch.usdToInr = v;
  }
  return patch;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [field, key] of Object.entries(KEYS)) {
    const value = patch[field as keyof AppSettings];
    if (value === undefined) continue;
    await sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  return getSettings();
}
