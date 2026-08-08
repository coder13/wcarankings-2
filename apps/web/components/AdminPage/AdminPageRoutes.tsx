"use client";

import dynamic from "next/dynamic";

const noServerRender = { ssr: false, loading: () => null };

export const AdminHealthRoute = dynamic(
  () =>
    import("@/components/AdminHealth/AdminHealth").then(
      (page) => page.AdminHealth,
    ),
  noServerRender,
);

export const LiveAdminRoute = dynamic(
  () =>
    import("@/components/LiveAdmin/LiveAdmin").then((page) => page.LiveAdmin),
  noServerRender,
);

export const LiveResultsSettingsRoute = dynamic(
  () =>
    import("@/components/LiveResultsSettings/LiveResultsSettings").then(
      (page) => page.LiveResultsSettings,
    ),
  noServerRender,
);

export const ProjectionQueueAdminRoute = dynamic(
  () =>
    import("@/components/ProjectionQueueAdmin/ProjectionQueueAdmin").then(
      (page) => page.ProjectionQueueAdmin,
    ),
  noServerRender,
);
