import type { ReactNode } from "react";
import { AdminShell } from "@/components/AdminPage/AdminShell";
import "@/components/AdminHealth/AdminHealth.module.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
