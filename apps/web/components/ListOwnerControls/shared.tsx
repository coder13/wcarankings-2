"use client";

import type { ReactNode } from "react";

export type ListPerson = {
  personId: string;
  name: string;
  avatarUrl: string | null;
  country?: { iso2: string; name: string };
  competitionCount?: number;
};

export type PersonSearchResponse = {
  entries: ListPerson[];
  page?: { hasMore?: boolean };
  total?: number;
};

export function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
  return `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase();
}

export function ListDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="listModalBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="listModal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="listModalHeading">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
