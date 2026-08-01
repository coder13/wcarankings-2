import {
  removeCurrentUserFromList,
  type ListRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export function DELETE(request: Request, context: ListRouteContext) {
  return withListErrors(() => removeCurrentUserFromList(request, context));
}
