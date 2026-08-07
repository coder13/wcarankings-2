"use client";

import { useQuery } from "@tanstack/react-query";

type WcaProfile = {
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
};

type WcaProfileResponse = {
  profile: WcaProfile | null;
  configured: boolean;
};

async function fetchWcaProfile(signal?: AbortSignal) {
  const response = await fetch("/api/auth/wca/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Could not load profile");
  return response.json() as Promise<WcaProfileResponse>;
}

export function useWcaProfile(enabled = true) {
  return useQuery({
    queryKey: ["wca-profile"],
    queryFn: ({ signal }) => fetchWcaProfile(signal),
    enabled,
    staleTime: 60_000,
  });
}
