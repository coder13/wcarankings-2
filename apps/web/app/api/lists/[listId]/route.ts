import {
  cloneUserList,
  deleteUserList,
  getList,
  type ListRouteContext,
  updateUserList,
  withListErrors,
} from "@/services/lists/controller";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: ListRouteContext) {
  return withListErrors(() => getList(request, context));
}

export function POST(request: Request, context: ListRouteContext) {
  return withListErrors(() => cloneUserList(request, context));
}

export function PATCH(request: Request, context: ListRouteContext) {
  return withListErrors(() => updateUserList(request, context));
}

export function DELETE(request: Request, context: ListRouteContext) {
  return withListErrors(() => deleteUserList(request, context));
}
