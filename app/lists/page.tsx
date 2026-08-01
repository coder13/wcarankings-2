import { ListBrowse } from "@/components/ListBrowse/ListBrowse";
import { listPublicLists } from "@/services/lists/lists";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  return <ListBrowse lists={await listPublicLists()} />;
}
