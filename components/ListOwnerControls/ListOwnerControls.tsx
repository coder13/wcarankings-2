"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RankingsRail } from "@/components/RankingsRail/RankingsRail";
import { Checkbox } from "@/components/Checkbox";
import { flagEmoji } from "@/lib/wca";
import { listPath } from "@/lib/list-path";
import { parseListMemberIds } from "@/lib/list-member-ids";
import { ListCreateDialog } from "./ListCreateDialog";

type Person = { personId: string; name: string; avatarUrl: string | null; country?: { iso2: string; name: string }; competitionCount?: number };
type SearchResponse = { entries: Person[]; page?: { hasMore?: boolean }; total?: number };
export type MembershipRequest = { id: number; personId: string; name: string; status?: "pending" | "accepted" | "rejected" | "cancelled" };

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
  return `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase();
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="listModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="listModal" role="dialog" aria-modal="true" aria-label={title}><div className="listModalHeading"><h2>{title}</h2><button type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button></div>{children}</section></div>;
}

export function ListCreateTrigger() {
  const [open, setOpen] = useState(false);
  return <><button className="listActionLink" type="button" onPointerDown={() => setOpen(true)} onClick={() => setOpen(true)}>Create a list</button>{open && <ListCreateDialog onClose={() => setOpen(false)} />}</>;
}

export function ListOwnerControls({ listId, initialVisibility, initialJoinPolicy = "closed", onManageMembers }: { listId: string; initialVisibility: "public" | "private"; initialJoinPolicy?: "open" | "closed"; onManageMembers?: () => void }) {
  const [mode, setModeState] = useState<"add" | "settings" | null>(null), [visibility, setVisibility] = useState(initialVisibility), [joinPolicy, setJoinPolicy] = useState(initialJoinPolicy), [query, setQuery] = useState(""), [entries, setEntries] = useState<Person[]>([]), [selected, setSelected] = useState<Person[]>([]), [ids, setIds] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const setMode = (next: "add" | "settings" | null) => setModeState((current) => next === "settings" && current === "settings" ? null : next);
  useEffect(() => { if (mode !== "add" || query.trim().length < 2) return; const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/people/search?q=${encodeURIComponent(query)}&limit=12`, { signal: controller.signal }).then((response) => response.json()).then((body: SearchResponse) => setEntries(body.entries ?? [])).catch(() => setEntries([])), 180); return () => { window.clearTimeout(timer); controller.abort(); }; }, [mode, query]);
  const selectedIds = useMemo(() => selected.map((person) => person.personId), [selected]);
  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode !== "settings") return; const close = (event: MouseEvent) => { if (!settingsRef.current?.contains(event.target as Node)) setMode(null); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [mode]);
  const add = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); const personIds = [...new Set([...selectedIds, ...parseListMemberIds(ids)])]; if (!personIds.length) { setError("Search for a person or enter at least one WCA ID."); setBusy(false); return; } const response = await fetch(`/api/lists/${listId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personIds }) }); const body = await response.json() as { error?: string; invalid?: string[]; blocked?: string[] }; if (!response.ok) { setError(body.error ?? "Could not add people."); setBusy(false); return; } if (body.invalid?.length || body.blocked?.length) { setError("Some IDs could not be added."); setBusy(false); return; } window.location.reload(); };
  const save = async (change: { visibility?: "public" | "private"; joinPolicy?: "open" | "closed" }) => { setBusy(true); setError(""); const response = await fetch(`/api/lists/${listId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }); if (!response.ok) { setError("Could not update this list."); setBusy(false); return; } if (change.visibility) setVisibility(change.visibility); if (change.joinPolicy) setJoinPolicy(change.joinPolicy); setBusy(false); setMode(null); window.location.reload(); };
  const duplicate = async () => { setBusy(true); const response = await fetch(`/api/lists/${listId}`, { method: "POST" }); const body = await response.json() as { list?: { publicId: string; slug: string } }; if (response.ok && body.list?.publicId) { window.location.assign(listPath({ publicId: body.list.publicId, systemAlias: null, slug: body.list.slug })); return; } setBusy(false); };
  const closeAdd = () => setMode(null);
  return <div className="listOwnerControls" ref={settingsRef}><button type="button" onClick={() => setMode("settings")} aria-label="List settings">⋮</button>{mode === "add" && <Dialog title="Add people" onClose={closeAdd}><form className="listModalForm" onSubmit={add}><label>Search by name or WCA ID<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a name" /></label>{query.trim().length >= 2 && entries.length > 0 && <div className="listPersonResults">{entries.map((person) => <button key={person.personId} type="button" onClick={() => { if (!selectedIds.includes(person.personId)) setSelected((current) => [...current, person]); setQuery(""); }}><span className="listPersonAvatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" decoding="async" referrerPolicy="no-referrer" /> : personInitials(person.name)}</span><span><strong>{person.country?.iso2 ? flagEmoji(person.country.iso2) + " " : ""}{person.name}</strong><small>{person.personId}</small></span>{person.competitionCount !== undefined && <b className="listAddCompetitionCount">{person.competitionCount} competitions</b>}</button>)}</div>}{selected.length > 0 && <div className="listPersonChips">{selected.map((person) => <button key={person.personId} type="button" onClick={() => setSelected((current) => current.filter((item) => item.personId !== person.personId))}>{person.name} · {person.personId} ×</button>)}</div>}<label>Or paste WCA IDs<textarea value={ids} onChange={(event) => setIds(event.target.value)} placeholder="2016PARK01, 2018EXAM02" rows={3} /></label>{error && <p className="listModalError" role="alert">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Adding…" : "Add people"}</button></form></Dialog>}{mode === "settings" && <div className="listSettingsMenu" role="menu"><button type="button" onClick={() => { onManageMembers?.(); setMode(null); }}>Manage members</button><a href={`/api/lists/${listId}?format=csv`}>Export CSV</a><button type="button" disabled={busy} onClick={() => void duplicate()}>{busy ? "Duplicating…" : "Duplicate list"}</button><label><input type="checkbox" checked={visibility === "private"} disabled={busy} onChange={(event) => void save({ visibility: event.target.checked ? "private" : "public" })} /> Private</label><label><input type="checkbox" checked={joinPolicy === "open"} disabled={busy} onChange={(event) => void save({ joinPolicy: event.target.checked ? "open" : "closed" })} /> Open to join</label>{error && <p role="alert">{error}</p>}</div>}</div>;
}

export function ListMembershipControls({ listId, joinPolicy, initialState }: { listId: string; joinPolicy: "open" | "closed"; initialState: "member" | "pending" | "not_member" }) {
  const [state, setState] = useState(initialState);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}/requests`, { method: "POST" });
    if (!response.ok) { setBusy(false); return; }
    const body = await response.json() as { status: "joined" | "pending" };
    setState(body.status === "joined" ? "member" : "pending");
    setBusy(false);
    window.location.reload();
  };
  const remove = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}/members/me`, { method: "DELETE" });
    if (!response.ok) { setBusy(false); return; }
    setState("not_member");
    setConfirmingRemoval(false);
    setBusy(false);
    window.location.reload();
  };
  return <div className="listMembershipControls">{state === "member" ? <button type="button" onClick={() => setConfirmingRemoval(true)}>Remove myself</button> : state === "pending" ? <button type="button" disabled>Request pending</button> : <button type="button" disabled={busy} onClick={() => void action()}>{busy ? "Joining…" : joinPolicy === "open" ? "Join list" : "Request to join"}</button>}{confirmingRemoval && <Dialog title="Remove yourself" onClose={() => !busy && setConfirmingRemoval(false)}><div className="listModalForm"><p>Remove yourself from this list?</p><div className="listRemovalActions"><button type="button" disabled={busy} onClick={() => setConfirmingRemoval(false)}>Cancel</button><button type="button" disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove myself"}</button></div></div></Dialog>}</div>;
}

export function ListMembershipRequestRows({ listId, initialRequests }: { listId: string; initialRequests: Array<Pick<MembershipRequest, "id" | "personId" | "name">> }) {
  const [requests, setRequests] = useState(initialRequests);
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);
  const [lastSelectedRequestIndex, setLastSelectedRequestIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const decide = async (requestIds: number[], decision: "accepted" | "rejected") => {
    if (!requestIds.length) return;
    setBusy(true);
    const results = await Promise.all(requestIds.map(async (requestId) => {
      const response = await fetch(`/api/lists/${listId}/requests/${requestId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json() as { error?: string };
      return { requestId, response, body };
    }));
    const resolvedRequestIds = results
      .filter(({ response, body }) => response.ok || body.error === "This membership request is no longer pending.")
      .map(({ requestId }) => requestId);
    if (resolvedRequestIds.length) {
      setRequests((current) => current.filter((request) => !resolvedRequestIds.includes(request.id)));
      setSelectedRequestIds((current) => current.filter((requestId) => !resolvedRequestIds.includes(requestId)));
    }
    setBusy(false);
  };
  const toggleSelection = (index: number, shiftKey: boolean) => {
    setSelectedRequestIds((current) => {
      const requestId = requests[index]!.id;
      const checked = !current.includes(requestId);
      if (!shiftKey || lastSelectedRequestIndex === null) return checked ? [...current, requestId] : current.filter((id) => id !== requestId);
      const range = requests.slice(Math.min(lastSelectedRequestIndex, index), Math.max(lastSelectedRequestIndex, index) + 1).map((request) => request.id);
      return checked ? [...new Set([...current, ...range])] : current.filter((id) => !range.includes(id));
    });
    setLastSelectedRequestIndex(index);
  };
  if (!requests.length) return null;
  const hasSelectedRequests = selectedRequestIds.length > 0;
  return <><section className="listMembershipRequests" aria-label="Membership requests"><div className="listMembershipRequestHeading"><h2>Membership requests</h2><div className="listMembershipRequestBulkActions" aria-hidden={!hasSelectedRequests}><button type="button" tabIndex={hasSelectedRequests ? 0 : -1} disabled={busy} onClick={() => void decide(selectedRequestIds, "rejected")}>Reject selected</button><button type="button" tabIndex={hasSelectedRequests ? 0 : -1} disabled={busy} onClick={() => void decide(selectedRequestIds, "accepted")}>Accept selected</button></div></div>{requests.map((request, index) => <div className="listMembershipRequest" key={request.id}><label className="listMembershipRequestSelection" onClick={(event) => { event.preventDefault(); toggleSelection(index, event.shiftKey); }}><Checkbox checked={selectedRequestIds.includes(request.id)} readOnly aria-label={`Select ${request.name}`} /><span><strong>{request.name}</strong><small>{request.personId}</small></span></label><div className="listMembershipRequestActions"><button type="button" disabled={busy} onClick={() => void decide([request.id], "rejected")}>Reject</button><button type="button" disabled={busy} onClick={() => void decide([request.id], "accepted")}>Accept</button></div></div>)}</section><div className="listMembershipRequestsDivider" aria-hidden="true" /></>;
}

export function ListAddPeopleRail({ listId, onCancel, onAdded }: { listId: string; onCancel: () => void; onAdded?: () => void }) {
  const [value, setValue] = useState(""), [entries, setEntries] = useState<Person[]>([]), [active, setActive] = useState(0), [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false), [totalResults, setTotalResults] = useState(0), [scrollTop, setScrollTop] = useState(0), [loadingMore, setLoadingMore] = useState(false), [searchOpen, setSearchOpen] = useState(false), [selected, setSelected] = useState<Person[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const router = useRouter();
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const pageSize = 25;
  const virtualizer = useVirtualizer({ count: entries.length, getScrollElement: () => suggestionsRef.current, estimateSize: () => 48, overscan: 5 });
  useEffect(() => { const dismiss = (event: MouseEvent) => { if (!composerRef.current?.contains(event.target as Node)) setSearchOpen(false); }; document.addEventListener("mousedown", dismiss); return () => document.removeEventListener("mousedown", dismiss); }, []);
  useEffect(() => { if (error) console.error("Could not add list members:", error); }, [error]);
  const moveActive = (next: number) => { const bounded = Math.max(0, Math.min(next, entries.length - 1)); setActive(bounded); const container = suggestionsRef.current; if (!container) return; const rowHeight = 48; const rowTop = bounded * rowHeight; const rowBottom = rowTop + rowHeight; if (rowTop < container.scrollTop) container.scrollTo({ top: rowTop, behavior: "smooth" }); else if (rowBottom > container.scrollTop + container.clientHeight) container.scrollTo({ top: rowBottom - container.clientHeight, behavior: "smooth" }); };
  useEffect(() => { const trimmed = value.trim(); const looksLikeWcaId = /^\d/.test(trimmed); const readyWcaId = /^\d{4}[A-Za-z]{2}/.test(trimmed); if (trimmed.length < 2 || /[,\n]/.test(value) || (looksLikeWcaId && !readyWcaId)) { setEntries([]); return; } suggestionsRef.current?.scrollTo({ top: 0 }); setOffset(0); const source = new EventSource(`/api/people/search?q=${encodeURIComponent(value)}&limit=25&offset=0`); source.addEventListener("results", (event) => { const body = JSON.parse((event as MessageEvent).data) as { data?: SearchResponse }; setEntries(body.data?.entries ?? []); setTotalResults(body.data?.total ?? 0); setScrollTop(0); setSearchOpen(true); setHasMore(Boolean(body.data?.page?.hasMore)); setActive(0); }); source.addEventListener("thumbs", (event) => { const thumbs = JSON.parse((event as MessageEvent).data) as Record<string, string | null>; Object.values(thumbs).forEach((thumb) => { if (thumb) { const image = new Image(); image.src = thumb; } }); setEntries((current) => current.map((person) => ({ ...person, avatarUrl: thumbs[person.personId] ?? person.avatarUrl }))); source.close(); }); source.onerror = () => { source.close(); }; return () => source.close(); }, [value]);
  const loadMore = () => { if (!hasMore || loadingMore || value.trim().length < 2 || entries.length < offset + pageSize) return; const nextOffset = offset + pageSize; setLoadingMore(true); const source = new EventSource(`/api/people/search?q=${encodeURIComponent(value)}&limit=25&offset=${nextOffset}`); source.addEventListener("results", (event) => { const body = JSON.parse((event as MessageEvent).data) as { data?: SearchResponse }; setEntries((current) => [...current, ...(body.data?.entries ?? [])]); setHasMore(Boolean(body.data?.page?.hasMore)); setOffset(nextOffset); }); source.addEventListener("thumbs", (event) => { const thumbs = JSON.parse((event as MessageEvent).data) as Record<string, string | null>; Object.values(thumbs).forEach((thumb) => { if (thumb) { const image = new Image(); image.src = thumb; } }); setEntries((current) => current.map((person) => ({ ...person, avatarUrl: thumbs[person.personId] ?? person.avatarUrl }))); setLoadingMore(false); source.close(); }); source.onerror = () => { setLoadingMore(false); source.close(); }; };
  const visibleResultCount = 10;
  const showScrollbar = entries.length > visibleResultCount;
  const scrollbarHeight = Math.max(12, Math.min(100, (visibleResultCount / Math.max(totalResults, 1)) * 100));
  const loadedScrollRange = Math.max(virtualizer.getTotalSize() - visibleResultCount * 48, 1);
  const scrollbarOffset = Math.max(0, Math.min(100 - scrollbarHeight, (scrollTop / loadedScrollRange) * (100 - scrollbarHeight)));
  const commit = async (people: Person[] = selected) => { const personIds = [...new Set(people.map((person) => person.personId))]; if (!personIds.length) return; setBusy(true); setError(""); const response = await fetch(`/api/lists/${listId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personIds }) }); const body = await response.json() as { error?: string; invalid?: string[]; blocked?: string[] }; if (!response.ok || body.invalid?.length || body.blocked?.length) { setError(body.error ?? "Some IDs could not be added."); setBusy(false); return; } setSelected([]); setValue(""); setEntries([]); setBusy(false); onAdded?.(); router.refresh(); };
  const select = (people: Person[]) => { setSelected((current) => [...current, ...people.filter((person) => !current.some((item) => item.personId === person.personId))]); setValue(""); setEntries([]); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!value.trim()) { void commit(); return; } const ids = parseListMemberIds(value); if (ids.length > 1 || /^\d{4}[A-Za-z0-9]{4}\d{2}$/.test(value.trim())) { void commit([...selected, ...ids.map((personId) => ({ personId, name: personId, avatarUrl: null }))]); return; } const person = entries[active]; if (person) void commit([...selected, person]); };
  return <RankingsRail className="Jump--listAdd" direction="up"><form ref={composerRef} className="listAddComposer" onSubmit={submit}><button className="listAddCancel" type="button" onClick={onCancel} aria-label="Cancel adding people">×</button><div className="listAddTokens">{selected.map((person) => <span key={person.personId} className="listAddChip"><span>{person.name}</span><button type="button" onClick={() => setSelected((current) => current.filter((item) => item.personId !== person.personId))} aria-label={`Remove ${person.name}`}>✕</button></span>)}<input value={value} onChange={(event) => { setValue(event.target.value); setSearchOpen(true); }} onFocus={() => { suggestionsRef.current?.scrollTo({ top: 0 }); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Tab" && entries[active]) { event.preventDefault(); select([entries[active]]); return; } if (event.key === "Backspace" && !value && selected.length) { event.preventDefault(); setSelected((current) => current.slice(0, -1)); return; } if (event.key === "ArrowDown") { event.preventDefault(); if (active >= entries.length - 4) loadMore(); moveActive(active + 1); } if (event.key === "ArrowUp") { event.preventDefault(); moveActive(active - 1); } if (event.key === "Escape") { event.preventDefault(); if (!selected.length) { onCancel(); return; } setValue(""); setEntries([]); setSearchOpen(false); setActive(0); setOffset(0); setHasMore(false); } }} placeholder="Add person" autoFocus disabled={busy} /></div><button className="listAddSubmit" type="submit" disabled={busy}>Add</button>{searchOpen && entries.length > 0 && <div ref={suggestionsRef} className="listAddSuggestions" onScroll={(event) => { const target = event.currentTarget; setScrollTop(target.scrollTop); if (target.scrollTop + target.clientHeight >= target.scrollHeight - target.clientHeight) loadMore(); }}><div className="listAddSuggestionCanvas" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualRow) => { const person = entries[virtualRow.index]; const index = virtualRow.index; return <button key={person.personId} data-result-index={index} type="button" className={index === active ? "isActive" : ""} style={{ transform: `translateY(${virtualRow.start}px)` }} onMouseDown={(event) => event.preventDefault()} onClick={() => select([person])}><span className="listPersonAvatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" decoding="async" referrerPolicy="no-referrer" /> : personInitials(person.name)}</span><span><strong>{person.country?.iso2 ? flagEmoji(person.country.iso2) + " " : ""}{person.name}</strong><small>{person.personId}</small></span>{person.competitionCount !== undefined && <b className="listAddCompetitionCount">{person.competitionCount} competitions</b>}</button>; })}</div></div>}{searchOpen && showScrollbar && <span className="listAddScrollbar" aria-hidden="true"><span style={{ height: `${scrollbarHeight}%`, top: `${scrollbarOffset}%` }} /></span>}</form>{error && <span className="listAddError">{error}</span>}</RankingsRail>;
}
