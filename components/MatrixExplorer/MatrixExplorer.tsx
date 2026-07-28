"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { JumpDownControls, MatrixJumpRail } from "../JumpControls/JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";
import { RankingControls } from "../RankingControls/RankingControls";
import { SearchInputs } from "../SearchInputs/SearchInputs";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { VimHelp } from "../VimHelp/VimHelp";
import { VimSearchInput } from "../VimSearchInput/VimSearchInput";
import { ViewSwitcher } from "../ViewSwitcher/ViewSwitcher";
import type { MatrixPage } from "@/lib/ranking-matrix";
import { rankingViewPath, type RankingView } from "@/lib/ranking-views";
import { WCA_EVENTS, flagEmoji, type RankingType } from "@/lib/wca";
import { formatFetchedAgo, type RegionOption, type RegionSelection } from "../RankingsExplorer/types";

function updateUrl(view: RankingView, type: RankingType, region: RegionSelection, search: string) {
  const params = new URLSearchParams();
  if (type !== "single") params.set("result", type);
  if (region.scope !== "world") params.set("region", region.regionId);
  if (search.trim()) params.set("search", search.trim());
  const query = params.toString();
  window.history.replaceState(window.history.state, "", query ? `${rankingViewPath(view)}?${query}` : rankingViewPath(view));
}

export function MatrixExplorer({
  initialData,
  initialView,
  initialRankingType,
  initialRegionSelection,
  initialSearch,
  initialRegions,
}: {
  initialData: MatrixPage;
  initialView: Exclude<RankingView, "wca">;
  initialRankingType: RankingType;
  initialRegionSelection: RegionSelection;
  initialSearch: string;
  initialRegions: {
    continents: Array<{ id: string; name: string }>;
    countries: Array<{ id: string; name: string; iso2?: string }>;
  };
}) {
  const [rankingType, setRankingType] = useState<RankingType>(initialRankingType);
  const [region, setRegion] = useState<RegionSelection>(initialRegionSelection);
  const [search, setSearch] = useState(initialSearch);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [findOpen, setFindOpen] = useState(Boolean(initialSearch));
  const [showTopRail, setShowTopRail] = useState(false);
  const [showBottomRail, setShowBottomRail] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [vimCommand, setVimCommand] = useState(":");
  const [vimSearchActive, setVimSearchActive] = useState(false);
  const [vimSearchQuery, setVimSearchQuery] = useState("");
  const [vimHelpOpen, setVimHelpOpen] = useState(false);
  const firstRequest = useRef(true);
  const headerFindInputRef = useRef<HTMLInputElement>(null);
  const vimInputRef = useRef<HTMLInputElement>(null);
  const regions: RegionOption[] = useMemo(() => [
    { key: "world", scope: "world", regionId: "", label: "World" },
    ...initialRegions.continents.map((item) => ({
      key: `continent:${item.id}`, scope: "continent" as const, regionId: item.id, label: item.name.replace(/^_/, ""),
    })),
    ...initialRegions.countries.map((item) => ({
      key: `country:${item.id}`, scope: "country" as const, regionId: item.id, label: item.name, iso2: item.iso2,
    })),
  ], [initialRegions]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    updateUrl(initialView, rankingType, region, search);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ view: initialView, result: rankingType });
      if (region.scope !== "world") params.set("region", region.regionId);
      if (search.trim()) params.set("search", search.trim());
      fetch(`/api/rankings?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Rankings are unavailable.");
          return response.json() as Promise<MatrixPage>;
        })
        .then(setData)
        .catch((requestError: unknown) => {
          if ((requestError as { name?: string }).name !== "AbortError") setError("Rankings are unavailable.");
        })
        .finally(() => setLoading(false));
    }, search === initialSearch ? 0 : 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [initialSearch, initialView, rankingType, region, search]);

  useEffect(() => {
    const updateRailVisibility = () => {
      const maximumScroll = document.documentElement.scrollHeight - window.innerHeight;
      setShowTopRail(window.scrollY > 240);
      setShowBottomRail(maximumScroll > 0 && window.scrollY < maximumScroll - 160);
    };

    updateRailVisibility();
    window.addEventListener("scroll", updateRailVisibility, { passive: true });
    window.addEventListener("resize", updateRailVisibility);
    return () => {
      window.removeEventListener("scroll", updateRailVisibility);
      window.removeEventListener("resize", updateRailVisibility);
    };
  }, [data.entries.length]);

  const kinch = initialView === "kinch";
  const title = kinch ? "Overall Kinch" : "Overall SOR";
  const findPending = loading && Boolean(search.trim());

  const closeFind = () => {
    setSearch("");
    setFindOpen(false);
  };

  const scrollByPage = (direction: -1 | 1) => {
    window.scrollBy({ top: direction * window.innerHeight * 0.8, behavior: "smooth" });
  };

  const jumpToRank = (rank: number) => {
    const row = document.querySelector(`[data-matrix-rank="${rank}"]`);
    if (row instanceof HTMLElement) row.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        setVimMode(false);
        setVimSearchActive(false);
        setVimCommand(":");
        setFindOpen(true);
        window.requestAnimationFrame(() => {
          headerFindInputRef.current?.focus();
          headerFindInputRef.current?.select();
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!vimMode || !vimCommand.startsWith("/")) return;
    window.requestAnimationFrame(() => {
      vimInputRef.current?.focus();
      vimInputRef.current?.setSelectionRange(vimCommand.length, vimCommand.length);
    });
  }, [vimCommand, vimMode]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']");
    const closeVim = () => {
      setVimMode(false);
      setVimSearchActive(false);
      setVimHelpOpen(false);
      setVimCommand(":");
    };
    const executeCommand = (command: string) => {
      const value = command.trim();
      const lower = value.toLocaleLowerCase();
      if (value === "G" || value === "$" || lower === "end") {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      } else if (value === "gg" || lower === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (value === "j" || value === "d" || lower === "down" || lower === "pagedown") {
        scrollByPage(1);
      } else if (value === "k" || value === "u" || lower === "up" || lower === "pageup") {
        scrollByPage(-1);
      } else if (/^\d[\d,]*$/.test(value)) {
        jumpToRank(Number(value.replaceAll(",", "")));
      } else if (/^[+-]\d+$/.test(value)) {
        window.scrollBy({ top: Number(value) * 65, behavior: "smooth" });
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditable(event.target);
      if (event.key === "Escape" && (vimMode || vimSearchActive)) {
        event.preventDefault();
        closeVim();
        return;
      }
      if (!vimMode) {
        if (!editable && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const direct = event.key.toLocaleLowerCase();
          if (["j", "d"].includes(direct)) {
            event.preventDefault();
            scrollByPage(1);
            return;
          }
          if (["k", "u"].includes(direct)) {
            event.preventDefault();
            scrollByPage(-1);
            return;
          }
          if (event.key === "G") {
            event.preventDefault();
            executeCommand("G");
            return;
          }
          if (event.key === ":" || event.key === "/") {
            event.preventDefault();
            setVimMode(true);
            setVimSearchActive(false);
            setFindOpen(false);
            setVimHelpOpen(false);
            setVimCommand(event.key);
          }
        }
        return;
      }
      if (editable && vimCommand.startsWith("/") && !["Enter", "Escape"].includes(event.key)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1 && !["Enter", "Escape", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      if (vimCommand.startsWith("/")) {
        if (event.key === "Enter") {
          const query = vimCommand.slice(1).trim();
          setSearch(query);
          setVimSearchQuery(query);
          setVimSearchActive(Boolean(query));
          setVimMode(false);
          setVimCommand(":");
        } else if (event.key === "Backspace") {
          setVimCommand((current) => current.length > 1 ? current.slice(0, -1) : current);
        } else if (event.key.length === 1) {
          setVimCommand((current) => current + event.key);
        }
        return;
      }
      const direct = event.key === "G" ? "G" : event.key.toLocaleLowerCase();
      if (vimCommand === ":" && ["j", "k", "d", "u", "G"].includes(direct)) {
        executeCommand(direct);
        setVimCommand(":");
      } else if (vimCommand === ":g" && event.key === "g") {
        executeCommand("gg");
        setVimCommand(":");
      } else if (event.key === "Enter") {
        executeCommand(vimCommand.slice(1));
        setVimMode(false);
        setVimCommand(":");
      } else if (event.key === "Backspace") {
        setVimCommand((current) => current.length > 1 ? current.slice(0, -1) : current);
      } else if (event.key.length === 1) {
        setVimCommand((current) => current + event.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [vimMode, vimCommand, vimSearchActive]);

  return (
    <div className={`app matrixApp${vimMode || vimSearchActive ? " app--vimMode" : ""}`}>
      <header className="header">
        <div className="headerTopRow">
          <div className="headerTitle">
            <h1 className="title">WCA Rankings</h1>
          </div>
          <div className="headerActions">
            <SearchInputs
              inputRef={(input) => {
                headerFindInputRef.current = input;
              }}
              findOpen={findOpen}
              findQuery={search}
              findError={error}
              findLoading={loading}
              findPending={findPending}
              findMatchCount={data.entries.length}
              onOpen={() => setFindOpen(true)}
              onClose={closeFind}
              onQueryChange={(value) => {
                setFindOpen(true);
                setSearch(value);
              }}
            />
            <ThemeToggle />
          </div>
        </div>
        <ViewSwitcher view={initialView} rankingType={rankingType} region={region} />
        <RankingControls
          eventId="333"
          rankingType={rankingType}
          regions={regions}
          regionSelection={region}
          showEvent={false}
          onEventChange={() => undefined}
          onRankingTypeChange={setRankingType}
          onRegionChange={(option) => setRegion({ scope: option.scope, regionId: option.regionId })}
        />
      </header>
      <main className="matrixMain">
        <JumpControlsVisibility visible={showTopRail}>
          <MatrixJumpRail
            armed
            currentPosition={1}
            jumpLabel="Back to top"
            onJump={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            findQuery={search}
            findError={error}
            findLoading={loading}
            findPending={findPending}
            findMatchCount={data.entries.length}
            rankingType={rankingType}
            onRankingTypeChange={setRankingType}
            regions={regions}
            regionSelection={region}
            onRegionChange={(option) => setRegion({ scope: option.scope, regionId: option.regionId })}
            onSearchOpen={() => setFindOpen(true)}
            onSearchClose={closeFind}
            onSearchQueryChange={(value) => {
              setFindOpen(true);
              setSearch(value);
            }}
          />
        </JumpControlsVisibility>
        {error ? <p className="listMessage">{error}</p> : (
          <div className="matrixScroll" aria-busy={loading}>
            <table className="matrixTable">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col" className="matrixPerson">Competitor</th>
                  <th scope="col" className="matrixOverall">{title}</th>
                  {data.supportedEventIds.map((eventId) => (
                    <th className="matrixEvent" key={eventId} scope="col" title={WCA_EVENTS.find((event) => event.id === eventId)?.name}>
                      {WCA_EVENTS.find((event) => event.id === eventId)?.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr data-matrix-rank={entry.rank} key={entry.personId}>
                    <td>{entry.rank}</td>
                    <th scope="row" className="matrixPerson">
                      <span>{flagEmoji(entry.countryIso2)} {entry.personName}</span>
                      <small>{entry.personId}</small>
                    </th>
                    <td className="matrixOverall">{kinch ? `${entry.overall.toFixed(2)}%` : entry.overall.toLocaleString()}</td>
                    {data.supportedEventIds.map((eventId) => {
                      const value = entry.eventValues[eventId];
                      return <td className="matrixEvent" key={eventId}>{kinch ? `${value.kinch?.toFixed(1)}%` : value.rank.toLocaleString()}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.entries.length && <p className="listMessage">No competitors have complete coverage for this view.</p>}
          </div>
        )}
        <JumpControlsVisibility visible={showBottomRail}>
          <JumpDownControls
            armed
            currentPosition={0}
            total={1}
            jumpLabel="Jump to end"
            onJump={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
            searchActive={false}
            onSearchPrevious={() => undefined}
            onSearchNext={() => undefined}
          />
        </JumpControlsVisibility>
      </main>
      {(vimMode || vimSearchActive) && (
        <VimSearchInput
          inputRef={vimInputRef}
          value={vimMode ? vimCommand : `/${vimSearchQuery}`}
          vimMode={vimMode}
          vimSearchActive={vimSearchActive}
          findLoading={loading}
          findPending={findPending}
          findQuery={search}
          activeFindMatch={null}
          findMatches={[]}
          findMatchCount={data.entries.length}
          vimHelpOpen={vimHelpOpen}
          searchLabel="Vim search"
          onChange={setVimCommand}
          onCycle={() => undefined}
          onToggleHelp={() => setVimHelpOpen((open) => !open)}
        />
      )}
      {(vimMode || vimSearchActive) && vimHelpOpen && (
        <VimHelp onClose={() => setVimHelpOpen(false)} searchDescription="Search names and WCA IDs" />
      )}
      <footer className="siteFooter">
        <span>By Adam Walker and Cailyn Sinclair</span>
        <span>{data.fetchedAt ? `fetched ${formatFetchedAgo(data.fetchedAt)}` : "fetched time unavailable"}</span>
      </footer>
    </div>
  );
}
