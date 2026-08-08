import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { PersonMedalPreview } from "@/components/ProfileStatPreviews/PersonMedalPreview";
import { PersonalBestsPreview } from "@/components/ProfileStatPreviews/PersonalBestsPreview";
import { PersonResultProgressPreview } from "@/components/ProfileStatPreviews/PersonResultProgressPreview";
import { PersonResultsPreview } from "@/components/ProfileStatPreviews/PersonResultsPreview";
import { PersonTopRankingHighlights } from "@/components/ProfileStatPreviews/PersonTopRankingHighlights";
import { StatPageLayout } from "@/components/StatPageLayout/StatPageLayout";
import {
  loadPersonProfileHeader,
  normalizeProfileWcaId,
} from "@/lib/person-profile";
import { flagEmoji } from "@/lib/wca";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ wcaId: string }>;
};

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatKinchScore(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { wcaId } = await params;
  const normalized = normalizeProfileWcaId(wcaId);
  if (!normalized) return { title: "Competitor profile" };
  const profile = await loadPersonProfileHeader(normalized);
  if (!profile) return { title: `${normalized} | WCA Rankings` };
  return {
    title: `${profile.person.name} | WCA Rankings`,
    description: `WCA rankings profile for ${profile.person.name} (${profile.person.id}).`,
  };
}

export default async function PersonProfilePage({ params }: PageProps) {
  const { wcaId } = await params;
  const profile = await loadPersonProfileHeader(wcaId);
  if (!profile) notFound();

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
