import { handleHomeFeedRequest } from "@/controllers/feed-controller";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleHomeFeedRequest(request);
}
