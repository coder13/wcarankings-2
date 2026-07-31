import {
  removeCurrentUserFromList,
  type ListRouteContext,
  withListErrors,
} from "@/controllers/list-controller";

export function DELETE(request: Request, context: ListRouteContext) {
  return withListErrors(() => removeCurrentUserFromList(request, context));
}
