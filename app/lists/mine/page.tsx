import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ListMine } from "@/components/ListMine/ListMine";
import { getAuthUser } from "@/services/auth/auth";
import { listOwnedLists } from "@/services/lists/lists";

export const dynamic = "force-dynamic";

export default async function MyListsPage() {
  const user = await getAuthUser(
    new Request("http://localhost", { headers: await headers() }),
  );
  if (!user) redirect("/api/auth/wca");
  return <ListMine lists={await listOwnedLists(user)} />;
}
