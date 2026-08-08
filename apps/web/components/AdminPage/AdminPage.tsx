"use client";

import type { ReactNode } from "react";
import styles from "@/components/AdminHealth/AdminHealth.module.css";

export function AdminPage({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {aside}
      </header>
      {children}
    </>
  );
}
