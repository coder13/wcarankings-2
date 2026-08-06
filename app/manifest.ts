import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WCA Rankings",
    short_name: "WCA Rankings",
    description: "Browse official World Cube Association rankings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffcff",
    theme_color: "#fffcff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
