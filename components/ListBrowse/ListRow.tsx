import Link from "next/link";
import type { PublicListSummary } from "@/lib/lists";
import { listPath } from "@/lib/list-path";
import "./ListBrowse.css";

export function ListRow({ list, alternate = false, subtitle }: { list: PublicListSummary; alternate?: boolean; subtitle?: string | null }) {
  const href = listPath(list);
  return (
    <li className={`listBrowseRow${alternate ? " isAlternate" : ""}`}>
      <Link href={href} className="listBrowseLink">
        <span className="listBrowseDetails">
          <span className="listBrowseName">{list.name}</span>
          {(subtitle ?? list.createdBy) && <span className="listBrowseCreator">{subtitle ?? list.createdBy}</span>}
        </span>
        <span className="listBrowseCount">{new Intl.NumberFormat().format(list.memberCount)} people</span>
      </Link>
    </li>
  );
}
