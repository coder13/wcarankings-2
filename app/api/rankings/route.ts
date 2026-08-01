import { handleRankingsRequest } from "@/controllers/rankings-controller";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRankingsRequest(request);
}
