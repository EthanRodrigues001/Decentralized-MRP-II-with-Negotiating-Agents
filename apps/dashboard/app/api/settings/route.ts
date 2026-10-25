import { handle, readJson } from "@/lib/api";
import { getSettings, updateSettings, validateSettingsPatch } from "@/lib/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ settings: await getSettings() }));
}

export function PUT(request: Request) {
  return handle(async () => {
    const patch = validateSettingsPatch(await readJson(request));
    if ("error" in patch) throw new Error(patch.error);
    return { settings: await updateSettings(patch) };
  });
}
