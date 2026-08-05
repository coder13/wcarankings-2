import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileStatPreviews } from "@/components/ProfileStatPreviews/ProfileStatPreviews";
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

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
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
          <span className="profileHubAvatar" aria-hidden="true">
            {person.avatarUrl ? (
              <Image
                src={person.avatarUrl}
                alt=""
                width={80}
                height={80}
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              initials(person.name)
            )}
          </span>
          <div className="profileHubIdentity">
            <p className="profileHubEyebrow">Competitor profile</p>
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

        <section className="profileHubCounts" aria-label="Competition summary">
          <div>
            <strong>{formatCount(profile.competitionCount)}</strong>
            <span>competitions</span>
          </div>
          <div>
            <strong>{formatCount(profile.solveCount)}</strong>
            <span>official solves</span>
          </div>
        </section>

        <section className="profileHubStats" aria-labelledby="profile-stats">
          <div className="profileHubSectionHeading">
            <div>
              <p className="profileHubEyebrow">Stats</p>
              <h2 id="profile-stats">Explore results</h2>
            </div>
            <Link href="/">All rankings</Link>
          </div>
          <ProfileStatPreviews personId={person.id} />
        </section>
      </main>
    </StatPageLayout>
  );
}
