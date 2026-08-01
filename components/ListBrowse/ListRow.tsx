import Link from "next/link";
import type { ListSummary, PublicListSummary } from "@/lib/lists";
import { listPath } from "@/lib/list-path";
import "./ListBrowse.css";

function listSubtitle(list: ListSummary | PublicListSummary) {
  if ("visibility" in list) {
    return list.visibility === "public" ? "Public" : "Private";
  }
  return list.createdBy;
}

export function ListRow({
  list,
  index,
}: {
  list: ListSummary | PublicListSummary;
  index: number;
}) {
  const subtitle = listSubtitle(list);
  return (
    <li className={`listBrowseRow${index % 2 === 1 ? " isAlternate" : ""}`}>
      <Link href={listPath(list)} className="listBrowseLink">
        <span className="listBrowseDetails">
          <span className="listBrowseName">{list.name}</span>
          {subtitle && <span className="listBrowseCreator">{subtitle}</span>}
        </span>
        <span className="listBrowseCount">{new Intl.NumberFormat().format(list.memberCount)} people</span>
      </Link>
    </li>
  );
}
