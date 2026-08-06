"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { PersonMedalPreview } from "@/components/ProfileStatPreviews/PersonMedalPreview";
import { PersonalBestsPreview } from "@/components/ProfileStatPreviews/PersonalBestsPreview";
import { PersonResultProgressPreview } from "@/components/ProfileStatPreviews/PersonResultProgressPreview";
import { PersonResultsPreview } from "@/components/ProfileStatPreviews/PersonResultsPreview";
import { PersonTopRankingHighlights } from "@/components/ProfileStatPreviews/PersonTopRankingHighlights";
import { StatPageLayout } from "@/components/StatPageLayout/StatPageLayout";
import { flagEmoji } from "@/lib/wca";

type Profile = {
  person: {
    id: string;
    name: string;
    countryName: string;
    countryIso2: string;
    continentName: string;
    avatarUrl: string | null;
  };
  competitionCount: number;
  countryCount: number;
  solveCount: number;
  kinchScore: number | null;
};

type ProfileResponse = Profile & { error?: string };

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatKinchScore(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    value,
  );
}

function ProfileLoading({ error }: { error: string | null }) {
  return (
    <StatPageLayout
      hasScrolled={false}
      exportDate={null}
      staticFooter
      showFreshness={false}
    >
      <main className="profileHub">
        <section className="profileHubHero">
          <div className="profileHubIdentity">
            <p className="profileHubEyebrow">Competitor profile</p>
            <h1>{error ?? "Loading profile…"}</h1>
            {error ? <p className="profileStatsMessage">{error}</p> : null}
          </div>
        </section>
      </main>
    </StatPageLayout>
  );
}

export default function PersonProfilePage() {
  const params = useParams<{ wcaId: string }>();
  const wcaId = Array.isArray(params.wcaId) ? params.wcaId[0] : params.wcaId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<{
    wcaId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/${encodeURIComponent(wcaId)}/profile`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ProfileResponse;
        if (!response.ok)
          throw new Error(body.error ?? "Profile is unavailable.");
        setProfile(body);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          wcaId,
          message:
            cause instanceof Error ? cause.message : "Profile is unavailable.",
        });
      });
    return () => controller.abort();
  }, [wcaId]);

  const normalizedWcaId = wcaId.toUpperCase();
  if (!profile || profile.person.id !== normalizedWcaId) {
    return (
      <ProfileLoading
        error={error && error.wcaId === normalizedWcaId ? error.message : null}
      />
    );
  }

  const { person } = profile;
  const region = [person.continentName, person.countryName]
    .filter(Boolean)
    .join(" · ");
  return (
    <StatPageLayout
      hasScrolled={false}
      exportDate={null}
      staticFooter
      showFreshness={false}
    >
      <main className="profileHub">
        <section className="profileHubHero" aria-labelledby="profile-name">
          <ProfileAvatar
            personId={person.id}
            name={person.name}
            initialAvatarUrl={person.avatarUrl}
          />
          <div className="profileHubIdentity">
            <h2 id="profile-name">{person.name}</h2>
            <p className="profileHubLocation">
              <span
                role="img"
                aria-label={person.countryName || "Country unavailable"}
              >
                {flagEmoji(person.countryIso2)}
              </span>
              <span>{region || "Region unavailable"}</span>
            </p>
            <p className="profileHubWcaId">{person.id}</p>
          </div>
          <a
            className="profileHubWcaLink"
            href={`https://www.worldcubeassociation.org/persons/${person.id}`}
            target="_blank"
            rel="noreferrer"
          >
            WCA profile
          </a>
        </section>
        <section className="profileHubCounts" aria-label="Profile summary">
          <div>
            <strong>{formatCount(profile.competitionCount)}</strong>
            <span>competitions</span>
          </div>
          <div>
            <strong>{formatCount(profile.solveCount)}</strong>
            <span>solves</span>
          </div>
          <div>
            <strong>{formatCount(profile.countryCount)}</strong>
            <span>countries</span>
          </div>
          <div>
            <strong>{formatKinchScore(profile.kinchScore)}</strong>
            <span>Kinch</span>
          </div>
        </section>
        <section className="profileHubStats" aria-label="Profile statistics">
          <PersonalBestsPreview personId={person.id} />
          <PersonMedalPreview personId={person.id} />
          <PersonResultsPreview personId={person.id} />
          <PersonResultProgressPreview personId={person.id} />
          <PersonTopRankingHighlights personId={person.id} />
        </section>
      </main>
    </StatPageLayout>
  );
}
