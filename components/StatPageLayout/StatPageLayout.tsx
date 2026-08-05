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

function StatPageFooter({ exportDate }: { exportDate: string | null }) {
  return (
    <footer className="siteFooter">
      <span>By Adam Walker and Cailyn Sinclair</span>
      <span>{formatRankingsFreshness(exportDate)}</span>
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
}: {
  className?: string;
  header?: ReactNode;
  topRail: ReactNode;
  children: ReactNode;
  hasScrolled: boolean;
  exportDate: string | null;
  navigation?: StatPageNavigation;
}) {
  const footer = <StatPageFooter exportDate={exportDate} />;

  return (
    <div className={`app${className ? ` ${className}` : ""}`}>
      <AppHeader>{header}</AppHeader>
      <ViewportEdgeGradients
        topVisible={hasScrolled}
        bottomVisible={hasScrolled}
      />
      {topRail}
      {children}
      {navigation && navigation.total > 0 ? (
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
      ) : (
        <div className="JumpControlsFallback" data-visible="true">
          {footer}
        </div>
      )}
    </div>
  );
}
