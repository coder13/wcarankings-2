import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ListMine } from "@/components/ListMine/ListMine";
import { getAuthUser } from "@/lib/auth";
import { listOwnedLists } from "@/lib/lists";

export const dynamic = "force-dynamic";

export default async function MyListsPage() {
  const request = new Request("http://localhost", { headers: await headers() });
  const user = await getAuthUser(request);
  if (!user) redirect("/api/auth/wca");
  return <ListMine lists={await listOwnedLists(user)} />;
}
