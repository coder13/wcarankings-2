import type { Metadata } from "next";
import { ListBrowse } from "@/components/ListBrowse/ListBrowse";

export const metadata: Metadata = {
  title: "Lists | WCA Rankings",
};

export default function ListsPage() {
  return <ListBrowse />;
}
