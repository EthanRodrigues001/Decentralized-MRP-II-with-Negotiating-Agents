"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppSettings } from "@/lib/settings";
import { SETTINGS_CHANGED } from "@/components/currency-provider";

export function SettingsForm() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
  }, []);

  if (!settings) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  async function save() {
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error ?? "could not save");
    setSettings(data.settings);
    setStatus("Saved.");
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="threshold">Auto-buy threshold (units)</Label>
        <Input
          id="threshold"
          type="number"
          min={0}
          className="font-mono"
          value={settings.autoBuyThreshold}
          onChange={(e) => setSettings({ ...settings, autoBuyThreshold: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          When stock is short by this many units or fewer, the purchasing agent buys the missing
          quantity automatically. A larger shortfall waits for your approval.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cap">Max auto-spend per day</Label>
        <Input
          id="cap"
          type="number"
          min={0}
          className="font-mono"
          value={settings.maxAutoSpendPerDay}
          onChange={(e) => setSettings({ ...settings, maxAutoSpendPerDay: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          Stops many small automatic buys from adding up unseen. Over the cap, orders need approval.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="daily">Orders started automatically per day</Label>
        <Input
          id="daily"
          type="number"
          min={0}
          className="font-mono"
          value={settings.dailyOrderLimit}
          onChange={(e) => setSettings({ ...settings, dailyOrderLimit: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          Each day the production agent starts this many fully reserved orders by itself, best priority first
          (then earliest due date). Urgent orders always start at once. Set 0 to start everything by hand.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Currency</Label>
        <div className="inline-flex rounded-md border p-0.5">
          {(["USD", "INR"] as const).map((c) => (
            <Button
              key={c}
              size="xs"
              variant={settings.displayCurrency === c ? "default" : "ghost"}
              onClick={() => setSettings({ ...settings, displayCurrency: c })}
            >
              {c === "USD" ? "$ Dollar" : "₹ Rupee"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="rate" className="text-xs text-muted-foreground">1 USD =</Label>
          <Input
            id="rate"
            type="number"
            min={0}
            step="0.01"
            className="h-8 w-28 font-mono"
            value={settings.usdToInr}
            onChange={(e) => setSettings({ ...settings, usdToInr: Number(e.target.value) })}
          />
          <span className="text-xs text-muted-foreground">INR</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Prices and totals are stored in dollars. This only changes how they are shown, using the rate above.
          The daily auto-spend cap stays in dollars.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.autoBuyEnabled}
          onChange={(e) => setSettings({ ...settings, autoBuyEnabled: e.target.checked })}
        />
        Auto-buy enabled
      </label>

      <div className="flex items-center gap-3">
        <Button onClick={save}>Save</Button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}
