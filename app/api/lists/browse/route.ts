import { getPublicLists, withListErrors } from "@/controllers/list-controller";

export const dynamic = "force-dynamic";

export function GET() {
  return withListErrors(getPublicLists);
}
