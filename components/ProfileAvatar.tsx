"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ThumbnailResponse = {
  avatarUrl?: string | null;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function ProfileAvatar({
  personId,
  name,
  initialAvatarUrl,
}: {
  personId: string;
  name: string;
  initialAvatarUrl: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  useEffect(() => {
    if (avatarUrl) return;
    const controller = new AbortController();
    fetch(`/api/people/${encodeURIComponent(personId)}/thumb`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as ThumbnailResponse;
        if (body.avatarUrl) setAvatarUrl(body.avatarUrl);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [avatarUrl, personId]);

  return (
    <span className="profileHubAvatar" aria-hidden="true">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={80}
          height={80}
          unoptimized
          referrerPolicy="no-referrer"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
