"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PROJECTION_FEATURE_SWITCH, type ProjectionFeatureSwitch } from "@/lib/projection-feature-switch-types";

const ProjectionFeatureSwitchContext = createContext<ProjectionFeatureSwitch | null>(null);

export function ProjectionFeatureSwitchProvider({ featureSwitch, children }: {
  featureSwitch: ProjectionFeatureSwitch;
  children: ReactNode;
}) {
  return <ProjectionFeatureSwitchContext.Provider value={featureSwitch}>{children}</ProjectionFeatureSwitchContext.Provider>;
}

export function useProjectionFeatureSwitch() {
  return useContext(ProjectionFeatureSwitchContext) ?? DEFAULT_PROJECTION_FEATURE_SWITCH;
}
