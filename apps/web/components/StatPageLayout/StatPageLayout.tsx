"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { JumpControlsVisibility } from "@/components/JumpControlsVisibility/JumpControlsVisibility";
import { RankingsPagerRail } from "@/components/RankingsRail/RankingsRail";
import { formatRankingsFreshness } from "@/components/RankingsExplorer/types";
import { ViewportEdgeGradients } from "@/components/ViewportEdgeGradients/ViewportEdgeGradients";

type StatPageNavigation = {
  currentPosition: number;
  total: number;
  onJumpUp: () => void;
  onJumpDown: () => void;
  onJumpToTop: () => void;
  onJumpToEnd: () => void;
};

function StatPageFooter({
  exportDate,
  showFreshness,
  standalone = false,
}: {
  exportDate: string | null;
  showFreshness: boolean;
  standalone?: boolean;
}) {
  return (
    <footer
      className={`siteFooter${standalone ? " siteFooter--standalone" : ""}`}
    >
      <span>By Adam Walker and Cailyn Sinclair</span>
      {showFreshness && <span>{formatRankingsFreshness(exportDate)}</span>}
    </footer>
  );
}

export function StatPageLayout({
  className = "",
  header,
  topRail,
  children,
  hasScrolled,
  exportDate,
  navigation,
  staticFooter = false,
  showFreshness = true,
}: {
  className?: string;
  header?: ReactNode;
  topRail?: ReactNode;
  children: ReactNode;
  hasScrolled: boolean;
  exportDate: string | null;
  navigation?: StatPageNavigation;
  staticFooter?: boolean;
  showFreshness?: boolean;
}) {
  const footer = (
    <StatPageFooter
      exportDate={exportDate}
      showFreshness={showFreshness}
      standalone={staticFooter}
    />
  );
  let bottomContent = (
    <div className="JumpControlsFallback" data-visible="true">
      {footer}
    </div>
  );

  if (staticFooter) bottomContent = footer;
  if (navigation && navigation.total > 0) {
    bottomContent = (
      <JumpControlsVisibility visible={hasScrolled} fallback={footer}>
        <RankingsPagerRail
          navigation={navigation}
          search={{
            active: false,
            onPrevious: () => undefined,
            onNext: () => undefined,
          }}
        />
      </JumpControlsVisibility>
    );
  }

  return (
    <div className={`app${className ? ` ${className}` : ""}`}>
      <AppHeader>{header}</AppHeader>
      <ViewportEdgeGradients
        topVisible={hasScrolled}
        bottomVisible={hasScrolled}
      />
      {topRail}
      {children}
      {bottomContent}
    </div>
  );
}
