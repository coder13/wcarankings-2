import { listPublicLists } from "@/lib/lists";

export const dynamic = "force-dynamic";

export async function GET() {
  const lists = await listPublicLists();
  return Response.json(
    { lists },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=300" } },
  );
}
