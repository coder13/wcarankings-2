import {
  buildApiErrorResponse,
  buildApiJsonResponse,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import { requireAuthUser } from "@/services/auth/auth";
import { ListValidationError, setListInclusionPreference } from "@/services/lists/lists";

function buildPrivatePreferenceResponse(allowListInclusion: boolean) {
  return buildApiJsonResponse(
    { allowListInclusion },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function getListInclusionPreference(request: Request) {
  const user = await requireAuthUser(request);
  return buildPrivatePreferenceResponse(user.allowListInclusion);
}

export async function updateListInclusionPreference(request: Request) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const body = await readJsonObject(request);
  if (typeof body.allowListInclusion !== "boolean") {
    throw new ListValidationError("allowListInclusion must be a boolean.");
  }
  await setListInclusionPreference(user, body.allowListInclusion);
  return buildPrivatePreferenceResponse(body.allowListInclusion);
}

export async function withAccountErrors(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return buildApiErrorResponse(error);
  }
}
