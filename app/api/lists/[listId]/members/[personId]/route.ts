import {
  removeListMemberById,
  type ListMemberRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export function DELETE(request: Request, context: ListMemberRouteContext) {
  return withListErrors(() => removeListMemberById(request, context));
}
