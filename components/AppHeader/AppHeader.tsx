"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileMenu } from "@/components/ProfileMenu/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";

export function AppHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={`header header--subjectMenu${className ? ` ${className}` : ""}`}>
      <div className="headerTopRow">
        <div className="headerTitle">
          <h1 className="title"><Link href="/">WCA Rankings</Link></h1>
          {children}
        </div>
        <div className="headerActions">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
