import { AuthenticationRequiredError } from "@/services/auth/auth";
import {
  ListConflictError,
  ListForbiddenError,
  ListNotFoundError,
  ListValidationError,
} from "@/services/lists/lists";

export function buildApiJsonResponse<T>(body: T, init?: ResponseInit) {
  return Response.json(body, init);
}

export function buildApiErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return buildApiJsonResponse(
      { error: error.message },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ListValidationError) {
    return buildApiJsonResponse(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ListNotFoundError) {
    return buildApiJsonResponse(
      { error: "List not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ListForbiddenError) {
    return buildApiJsonResponse(
      { error: error.message },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ListConflictError) {
    return buildApiJsonResponse(
      { error: error.message },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error(error);
  return buildApiJsonResponse(
    { error: "The request could not be completed." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readJsonObject(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ListValidationError("Expected an application/json request.");
  }
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ListValidationError("Expected a JSON object.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ListValidationError) throw error;
    throw new ListValidationError("The request body is not valid JSON.");
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) {
    throw new ListForbiddenError("Cross-origin mutations are not allowed.");
  }
}
