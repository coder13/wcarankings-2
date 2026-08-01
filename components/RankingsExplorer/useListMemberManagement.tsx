"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import type { RankingEntry } from "./types";

type ContextMenuPosition = {
  personId: string;
  x: number;
  y: number;
};

type ListMemberManagementOptions = {
  listId?: string;
  onRemoved: () => void;
};

export type ListMemberManagementController = {
  selection: {
    active: boolean;
    personIds: ReadonlySet<string>;
    start: () => void;
    cancel: () => void;
    toggle: (personId: string) => void;
    removeSelected: () => void;
  };
  contextMenu: {
    value: ContextMenuPosition | null;
    open: (
      entry: RankingEntry,
      position: { x: number; y: number },
    ) => void;
    close: () => void;
    removePerson: () => void;
  };
  removal: {
    open: boolean;
    busy: boolean;
    error: string;
    personIds: readonly string[];
    cancel: () => void;
    confirm: () => Promise<void>;
  };
};

export function useListMemberManagement({
  listId,
  onRemoved,
}: ListMemberManagementOptions): ListMemberManagementController {
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(
    null,
  );
  const [removalPersonIds, setRemovalPersonIds] = useState<string[]>([]);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalError, setRemovalError] = useState("");

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeContextMenu, contextMenu]);

  const requestRemoval = useCallback((personIds: readonly string[]) => {
    if (personIds.length === 0) return;
    setRemovalError("");
    setRemovalPersonIds([...personIds]);
    setRemovalOpen(true);
  }, []);

  const confirmRemoval = useCallback(async () => {
    if (!listId || removalPersonIds.length === 0) return;
    setRemovalBusy(true);
    setRemovalError("");
    try {
      const responses = await Promise.all(
        removalPersonIds.map((personId) =>
          fetch(`/api/lists/${listId}/members/${personId}`, {
            method: "DELETE",
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        throw new Error("Could not remove every selected person.");
      }
      setSelectedPersonIds(new Set());
      setSelectionActive(false);
      setRemovalOpen(false);
      setRemovalPersonIds([]);
      onRemoved();
    } catch (error) {
      setRemovalError(
        error instanceof Error ? error.message : "Could not remove people.",
      );
    } finally {
      setRemovalBusy(false);
    }
  }, [listId, onRemoved, removalPersonIds]);

  return useMemo(
    () => ({
      selection: {
        active: selectionActive,
        personIds: selectedPersonIds,
        start: () => {
          setSelectionActive(true);
          setSelectedPersonIds(new Set());
        },
        cancel: () => setSelectionActive(false),
        toggle: (personId: string) => {
          setSelectedPersonIds((current) => {
            const next = new Set(current);
            if (next.has(personId)) next.delete(personId);
            else next.add(personId);
            return next;
          });
        },
        removeSelected: () => requestRemoval([...selectedPersonIds]),
      },
      contextMenu: {
        value: contextMenu,
        open: (
          entry: RankingEntry,
          position: { x: number; y: number },
        ) => {
          if (!listId) return;
          setContextMenu({
            personId: entry.personId,
            x: Math.max(8, Math.min(position.x, window.innerWidth - 176)),
            y: Math.max(8, Math.min(position.y, window.innerHeight - 56)),
          });
        },
        close: closeContextMenu,
        removePerson: () => {
          if (!contextMenu) return;
          closeContextMenu();
          requestRemoval([contextMenu.personId]);
        },
      },
      removal: {
        open: removalOpen,
        busy: removalBusy,
        error: removalError,
        personIds: removalPersonIds,
        cancel: () => {
          if (!removalBusy) setRemovalOpen(false);
        },
        confirm: confirmRemoval,
      },
    }),
    [
      closeContextMenu,
      confirmRemoval,
      contextMenu,
      listId,
      removalBusy,
      removalError,
      removalOpen,
      removalPersonIds,
      requestRemoval,
      selectedPersonIds,
      selectionActive,
    ],
  );
}

export function ListMemberManagementOverlays() {
  const { data: { listMembers: controller } } = useRankingsExplorer();
  const { selection, contextMenu, removal } = controller;

  return (
    <>
      {selection.active && (
        <div className="listMemberSelectionRail">
          <button type="button" onClick={selection.cancel}>Cancel</button>
          <span>{selection.personIds.size} selected</span>
          <button
            type="button"
            disabled={!selection.personIds.size}
            onClick={selection.removeSelected}
          >
            Remove
          </button>
        </div>
      )}

      {contextMenu.value && (
        <>
          <div
            className="listMemberContextMenuBackdrop"
            onPointerDown={contextMenu.close}
          />
          <div
            className="listMemberContextMenu"
            role="menu"
            style={{
              left: contextMenu.value.x,
              top: contextMenu.value.y,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={contextMenu.removePerson}
            >
              Remove
            </button>
          </div>
        </>
      )}

      {removal.open && (
        <div
          className="listModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) removal.cancel();
          }}
        >
          <section
            className="listModal listRemovalDialog"
            role="dialog"
            aria-modal="true"
            aria-label="Remove people"
          >
            <h2>Remove people?</h2>
            <p>
              Remove {removal.personIds.length}{" "}
              {removal.personIds.length === 1 ? "person" : "people"} from
              this list?
            </p>
            {removal.error && (
              <p className="listModalError" role="alert">{removal.error}</p>
            )}
            <div className="listRemovalActions">
              <button
                type="button"
                disabled={removal.busy}
                onClick={removal.cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removal.busy}
                onClick={() => void removal.confirm()}
              >
                {removal.busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
