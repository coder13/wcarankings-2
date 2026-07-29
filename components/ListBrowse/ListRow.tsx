import Link from "next/link";
import type { PublicListSummary } from "@/lib/lists";
import "./ListBrowse.css";

export function ListRow({ list, alternate = false, subtitle }: { list: PublicListSummary; alternate?: boolean; subtitle?: string | null }) {
  const listId = list.systemAlias ?? list.publicId;
  if (!listId) return null;
  return (
    <li className={`listBrowseRow${alternate ? " isAlternate" : ""}`}>
      <Link href={`/lists/${listId}`} className="listBrowseLink">
        <span className="listBrowseDetails">
          <span className="listBrowseName">{list.name}</span>
          {(subtitle ?? list.createdBy) && <span className="listBrowseCreator">{subtitle ?? list.createdBy}</span>}
        </span>
        <span className="listBrowseCount">{new Intl.NumberFormat().format(list.memberCount)} people</span>
      </Link>
    </li>
  );
}
