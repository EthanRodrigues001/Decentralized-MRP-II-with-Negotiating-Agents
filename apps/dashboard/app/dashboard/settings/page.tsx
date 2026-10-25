import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">Rules the agents follow. Changes apply to the next event.</p>
      </div>
      <SettingsForm />
    </div>
  );
}
