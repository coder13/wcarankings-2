"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ExplorerSubjectSwitch,
  type NavigationSubject,
} from "@/components/ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { ProfileMenu } from "@/components/ProfileMenu/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";

export function AppHeader({
  actions,
  children,
  className = "",
  subject,
  onSubjectChange,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  subject?: NavigationSubject;
  onSubjectChange?: (subject: NavigationSubject) => void;
}) {
  return (
    <header
      className={`header header--subjectMenu${className ? ` ${className}` : ""}`}
    >
      <div className="headerTopRow">
        <div className="headerTitle">
          <h1 className="title">
            {subject && onSubjectChange ? (
              <ExplorerSubjectSwitch
                subject={subject}
                onChange={onSubjectChange}
                variant="title"
              />
            ) : (
              <Link href="/">WCA Rankings</Link>
            )}
          </h1>
        </div>
        <div className="headerDropdowns">{children}</div>
        <div className="headerActions">
          {actions}
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
