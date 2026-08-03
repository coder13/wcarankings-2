"use client";

import { animate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RowAnimation = {
  stop: () => void;
  finish: () => void;
};

type HeightTransition = {
  index: number;
  height: number;
};

type RowTransitionControls = {
  resizeRow: (globalIndex: number, size: number) => void;
  onStart?: () => void;
};

export function useSingleExpandedVirtualRow({
  totalRows,
  rowHeight,
  expandedRowHeight,
  duration,
  ease,
}: {
  totalRows: number;
  rowHeight: number;
  expandedRowHeight: number;
  duration: number;
  ease: readonly [number, number, number, number];
}) {
  const expandedExtraHeight = expandedRowHeight - rowHeight;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const expandingRef = useRef<HeightTransition | null>(null);
  const collapsingRef = useRef<HeightTransition | null>(null);
  const animationRef = useRef<RowAnimation | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const rowSize = useCallback(
    (index: number) => {
      const expanding = expandingRef.current;
      const collapsing = collapsingRef.current;
      let extraHeight = 0;
      if (expanding?.index === index) extraHeight += expanding.height;
      else if (expandedIndex === index) extraHeight += expandedExtraHeight;
      if (collapsing?.index === index) extraHeight += collapsing.height;
      return rowHeight + extraHeight;
    },
    [expandedExtraHeight, expandedIndex, rowHeight],
  );

  const offsetForIndex = useCallback(
    (requestedIndex: number) => {
      const index = Math.min(totalRows, Math.max(0, requestedIndex));
      const expanding = expandingRef.current;
      const collapsing = collapsingRef.current;
      let offset = index * rowHeight;
      if (expanding && expanding.index < index) offset += expanding.height;
      else if (expandedIndex !== null && expandedIndex < index) {
        offset += expandedExtraHeight;
      }
      if (collapsing && collapsing.index < index) offset += collapsing.height;
      return offset;
    },
    [expandedExtraHeight, expandedIndex, rowHeight, totalRows],
  );

  const indexAtOffset = useCallback(
    (requestedOffset: number) => {
      const offset = Math.max(0, requestedOffset);
      const expanding = expandingRef.current;
      const expanded = expanding ?? (
        expandedIndex === null
          ? null
          : { index: expandedIndex, height: expandedExtraHeight }
      );
      const collapsing = collapsingRef.current;
      let first = expanded;
      let second = collapsing;

      if (!first || (second && second.index < first.index)) {
        [first, second] = [second, first];
      }
      if (!first) return Math.min(totalRows, offset / rowHeight);
      if (second?.index === first.index) {
        first = { index: first.index, height: first.height + second.height };
        second = null;
      }

      const firstStart = first.index * rowHeight;
      if (offset < firstStart) return offset / rowHeight;
      const firstEnd = firstStart + rowHeight + first.height;
      if (offset < firstEnd) {
        return first.index +
          (offset - firstStart) / (rowHeight + first.height);
      }
      if (!second) {
        return Math.min(
          totalRows,
          first.index + 1 + (offset - firstEnd) / rowHeight,
        );
      }

      const secondStart =
        firstEnd + (second.index - first.index - 1) * rowHeight;
      if (offset < secondStart) {
        return first.index + 1 + (offset - firstEnd) / rowHeight;
      }
      const secondEnd = secondStart + rowHeight + second.height;
      if (offset < secondEnd) {
        return second.index +
          (offset - secondStart) / (rowHeight + second.height);
      }
      return Math.min(
        totalRows,
        second.index + 1 + (offset - secondEnd) / rowHeight,
      );
    },
    [expandedExtraHeight, expandedIndex, rowHeight, totalRows],
  );

  const finish = useCallback(() => animationRef.current?.finish(), []);
  const reset = useCallback((controls: RowTransitionControls) => {
    animationRef.current?.stop();
    const affected = [expandingRef.current, collapsingRef.current];
    if (expandedIndex !== null) {
      affected.push({ index: expandedIndex, height: expandedExtraHeight });
    }
    for (const row of affected) {
      if (row) controls.resizeRow(row.index, rowHeight);
    }
    expandingRef.current = null;
    collapsingRef.current = null;
    animationRef.current = null;
    setExpandedIndex(null);
  }, [expandedExtraHeight, expandedIndex, rowHeight]);

  const toggle = useCallback(
    (requestedIndex: number, controls: RowTransitionControls) => {
      if (totalRows <= 0) return;
      const index = Math.min(
        totalRows - 1,
        Math.max(0, Math.trunc(requestedIndex)),
      );
      const previousExpanding = expandingRef.current;
      const previousCollapsing = collapsingRef.current;
      const nextExpandedIndex = expandedIndex === index ? null : index;

      animationRef.current?.stop();
      controls.onStart?.();

      let openingStartHeight = 0;
      if (previousExpanding?.index === nextExpandedIndex) {
        openingStartHeight = previousExpanding.height;
      } else if (previousCollapsing?.index === nextExpandedIndex) {
        openingStartHeight = previousCollapsing.height;
      }

      let closingIndex: number | null = null;
      let closingStartHeight = 0;
      if (expandedIndex !== null && expandedIndex !== nextExpandedIndex) {
        closingIndex = expandedIndex;
        closingStartHeight = previousExpanding?.index === expandedIndex
          ? previousExpanding.height
          : expandedExtraHeight;
      } else if (
        previousCollapsing &&
        previousCollapsing.index !== nextExpandedIndex
      ) {
        closingIndex = previousCollapsing.index;
        closingStartHeight = previousCollapsing.height;
      }

      const expanding = nextExpandedIndex === null
        ? null
        : { index: nextExpandedIndex, height: openingStartHeight };
      const collapsing = closingIndex === null
        ? null
        : { index: closingIndex, height: closingStartHeight };

      for (const staleRow of [previousExpanding, previousCollapsing]) {
        if (
          staleRow &&
          staleRow.index !== expanding?.index &&
          staleRow.index !== collapsing?.index
        ) {
          controls.resizeRow(staleRow.index, rowHeight);
        }
      }

      const expand = (height: number) => {
        if (!expanding) return;
        expanding.height = height;
        controls.resizeRow(expanding.index, rowHeight + height);
      };
      const collapse = (height: number) => {
        if (!collapsing) return;
        collapsing.height = height;
        controls.resizeRow(collapsing.index, rowHeight + height);
      };

      expandingRef.current = expanding;
      collapsingRef.current = collapsing;
      expand(openingStartHeight);
      collapse(closingStartHeight);
      setExpandedIndex(nextExpandedIndex);

      let finalized = false;
      const applyTargets = () => {
        if (finalized) return;
        finalized = true;
        expand(expandedExtraHeight);
        collapse(0);
        expandingRef.current = null;
        collapsingRef.current = null;
        animationRef.current = null;
      };

      if (shouldReduceMotion) {
        applyTargets();
        return;
      }

      const animation = animate(0, 1, {
        duration,
        ease,
        onUpdate: (progress) => {
          expand(
            openingStartHeight +
              (expandedExtraHeight - openingStartHeight) * progress,
          );
          collapse(closingStartHeight * (1 - progress));
        },
        onComplete: applyTargets,
      });
      animationRef.current = {
        stop: () => animation.stop(),
        finish: () => {
          animation.stop();
          applyTargets();
        },
      };
    },
    [
      duration,
      ease,
      expandedExtraHeight,
      expandedIndex,
      rowHeight,
      shouldReduceMotion,
      totalRows,
    ],
  );

  useEffect(() => () => animationRef.current?.stop(), []);

  return useMemo(
    () => ({
      expandedIndex,
      rowSize,
      offsetForIndex,
      indexAtOffset,
      toggle,
      finish,
      reset,
    }),
    [expandedIndex, finish, indexAtOffset, offsetForIndex, reset, rowSize, toggle],
  );
}
