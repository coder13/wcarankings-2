import { getPublicLists, withListErrors } from "@/services/lists/controller";

export const dynamic = "force-dynamic";

export function GET() {
  return withListErrors(getPublicLists);
}
