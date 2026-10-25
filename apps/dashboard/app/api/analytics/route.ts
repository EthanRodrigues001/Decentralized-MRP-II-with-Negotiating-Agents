import { handle } from "@/lib/api";
import { getAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(getAnalytics);
}
