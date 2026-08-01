"use client";

import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RankingsRail } from "@/components/RankingsRail/RankingsRail";
import { parseListMemberIds } from "@/lib/helpers/lists/list-member-ids";
import { flagEmoji } from "@/lib/wca";
import { personInitials, type ListPerson } from "./shared";
import { usePersonSearchStream } from "./usePersonSearchStream";

const ROW_HEIGHT = 48;
const VISIBLE_RESULT_COUNT = 10;

export function ListAddPeopleRail({
  listId,
  onCancel,
  onAdded,
}: {
  listId: string;
  onCancel: () => void;
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<ListPerson[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const search = usePersonSearchStream(value, searchOpen);
  const { entries } = search;
  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => suggestionsRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  const moveActive = (next: number) => {
    const bounded = Math.max(0, Math.min(next, entries.length - 1));
    setActive(bounded);
    const container = suggestionsRef.current;
    if (!container) return;
    const rowTop = bounded * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop < container.scrollTop) {
      container.scrollTo({ top: rowTop, behavior: "smooth" });
    } else if (rowBottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({
        top: rowBottom - container.clientHeight,
        behavior: "smooth",
      });
    }
  };

  const select = (people: ListPerson[]) => {
    setSelected((current) => [
      ...current,
      ...people.filter(
        (person) => !current.some((item) => item.personId === person.personId),
      ),
    ]);
    setValue("");
    setActive(0);
  };

  const commit = async (people: ListPerson[] = selected) => {
    const personIds = [...new Set(people.map((person) => person.personId))];
    if (!personIds.length) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/lists/${listId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personIds }),
    });
    const body = await response.json() as {
      error?: string;
      invalid?: string[];
      blocked?: string[];
    };
    if (!response.ok || body.invalid?.length || body.blocked?.length) {
      setError(body.error ?? "Some IDs could not be added.");
      setBusy(false);
      return;
    }
    setSelected([]);
    setValue("");
    setBusy(false);
    onAdded?.();
    router.refresh();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      void commit();
      return;
    }
    const ids = parseListMemberIds(value);
    if (
      ids.length > 1 ||
      /^\d{4}[A-Za-z0-9]{4}\d{2}$/.test(value.trim())
    ) {
      void commit([
        ...selected,
        ...ids.map((personId) => ({ personId, name: personId, avatarUrl: null })),
      ]);
      return;
    }
    const person = entries[activeIndex];
    if (person) void commit([...selected, person]);
  };

  const resetSearch = () => {
    setValue("");
    setSearchOpen(false);
    setActive(0);
  };

  const showScrollbar = entries.length > VISIBLE_RESULT_COUNT;
  const scrollbarHeight = Math.max(
    12,
    Math.min(
      100,
      (VISIBLE_RESULT_COUNT / Math.max(search.total, 1)) * 100,
    ),
  );
  const loadedScrollRange = Math.max(
    virtualizer.getTotalSize() - VISIBLE_RESULT_COUNT * ROW_HEIGHT,
    1,
  );
  const scrollbarOffset = Math.max(
    0,
    Math.min(
      100 - scrollbarHeight,
      (scrollTop / loadedScrollRange) * (100 - scrollbarHeight),
    ),
  );

  return (
    <RankingsRail className="Jump--listAdd" direction="up">
      <form ref={composerRef} className="listAddComposer" onSubmit={submit}>
        <button
          className="listAddCancel"
          type="button"
          onClick={onCancel}
          aria-label="Cancel adding people"
        >
          ×
        </button>
        <div className="listAddTokens">
          {selected.map((person) => (
            <span key={person.personId} className="listAddChip">
              <span>{person.name}</span>
              <button
                type="button"
                onClick={() => setSelected((current) =>
                  current.filter((item) => item.personId !== person.personId)
                )}
                aria-label={`Remove ${person.name}`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setActive(0);
              setScrollTop(0);
              setSearchOpen(true);
              suggestionsRef.current?.scrollTo({ top: 0 });
            }}
            onFocus={() => {
              suggestionsRef.current?.scrollTo({ top: 0 });
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab" && entries[activeIndex]) {
                event.preventDefault();
                select([entries[activeIndex]]);
                return;
              }
              if (event.key === "Backspace" && !value && selected.length) {
                event.preventDefault();
                setSelected((current) => current.slice(0, -1));
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (activeIndex >= entries.length - 4) search.loadMore();
                moveActive(activeIndex + 1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(activeIndex - 1);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                if (!selected.length) {
                  onCancel();
                  return;
                }
                resetSearch();
              }
            }}
            placeholder="Add person"
            autoFocus
            disabled={busy}
          />
        </div>
        <button className="listAddSubmit" type="submit" disabled={busy}>
          Add
        </button>

        {searchOpen && entries.length > 0 && (
          <div
            ref={suggestionsRef}
            className="listAddSuggestions"
            onScroll={(event) => {
              const target = event.currentTarget;
              setScrollTop(target.scrollTop);
              if (
                target.scrollTop + target.clientHeight >=
                target.scrollHeight - target.clientHeight
              ) {
                search.loadMore();
              }
            }}
          >
            <div
              className="listAddSuggestionCanvas"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const person = entries[virtualRow.index];
                const index = virtualRow.index;
                return (
                  <button
                    key={person.personId}
                    data-result-index={index}
                    type="button"
                    className={index === activeIndex ? "isActive" : ""}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select([person])}
                  >
                    <span className="listPersonAvatar">
                      {person.avatarUrl ? (
                        // External WCA thumbnails are already sized for this UI.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.avatarUrl}
                          alt=""
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      ) : personInitials(person.name)}
                    </span>
                    <span>
                      <strong>
                        {person.country?.iso2
                          ? `${flagEmoji(person.country.iso2)} `
                          : ""}
                        {person.name}
                      </strong>
                      <small>{person.personId}</small>
                    </span>
                    {person.competitionCount !== undefined && (
                      <b className="listAddCompetitionCount">
                        {person.competitionCount} competitions
                      </b>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {searchOpen && showScrollbar && (
          <span className="listAddScrollbar" aria-hidden="true">
            <span
              style={{
                height: `${scrollbarHeight}%`,
                top: `${scrollbarOffset}%`,
              }}
            />
          </span>
        )}
      </form>
      {error && <span className="listAddError">{error}</span>}
    </RankingsRail>
  );
}
