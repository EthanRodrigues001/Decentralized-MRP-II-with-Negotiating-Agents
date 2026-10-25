import { handle } from "@/lib/api";
import { settleAllFinished } from "@/lib/threads";

export function POST() {
  return handle(async () => ({ settled: await settleAllFinished() }));
}
