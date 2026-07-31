import {
  removeListMemberById,
  type ListMemberRouteContext,
  withListErrors,
} from "@/controllers/list-controller";

export function DELETE(request: Request, context: ListMemberRouteContext) {
  return withListErrors(() => removeListMemberById(request, context));
}
