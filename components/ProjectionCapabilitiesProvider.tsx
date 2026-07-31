"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PROJECTION_CAPABILITIES, type ProjectionCapabilities } from "@/lib/projection-capabilities-types";

const ProjectionCapabilitiesContext = createContext<ProjectionCapabilities | null>(null);

export function ProjectionCapabilitiesProvider({ capabilities, children }: {
  capabilities: ProjectionCapabilities;
  children: ReactNode;
}) {
  return <ProjectionCapabilitiesContext.Provider value={capabilities}>{children}</ProjectionCapabilitiesContext.Provider>;
}

export function useProjectionCapabilities() {
  return useContext(ProjectionCapabilitiesContext) ?? DEFAULT_PROJECTION_CAPABILITIES;
}
