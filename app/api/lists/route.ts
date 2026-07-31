import { createUserList, getUserLists, withListErrors } from "@/controllers/list-controller";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withListErrors(() => getUserLists(request));
}

export function POST(request: Request) {
  return withListErrors(() => createUserList(request));
}
