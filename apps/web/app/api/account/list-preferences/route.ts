import {
  getListInclusionPreference,
  updateListInclusionPreference,
  withAccountErrors,
} from "@/controllers/account-controller";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withAccountErrors(() => getListInclusionPreference(request));
}

export function PATCH(request: Request) {
  return withAccountErrors(() => updateListInclusionPreference(request));
}
