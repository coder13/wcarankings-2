import { StatPreviewTable } from "./StatPreviewTable";

type PersonalBest = {
  value: string;
  ranks: readonly PersonalBestRank[];
};

type PersonalBestRank = {
  scope: "WR" | "CR" | "NR";
  value: number;
};

const mockPersonalBests: ReadonlyArray<{
  eventId: string;
  eventName: string;
  single: PersonalBest;
  average?: PersonalBest;
}> = [
  {
    eventId: "333",
    eventName: "3x3x3 Cube",
    single: {
      value: "2.76",
      ranks: [
        { scope: "WR", value: 1 },
        { scope: "CR", value: 1 },
        { scope: "NR", value: 1 },
      ],
    },
    average: {
      value: "4.41",
      ranks: [
        { scope: "WR", value: 6 },
        { scope: "CR", value: 1 },
        { scope: "NR", value: 1 },
      ],
    },
  },
  {
    eventId: "222",
    eventName: "2x2x2 Cube",
    single: {
      value: "0.43",
      ranks: [
        { scope: "WR", value: 4 },
        { scope: "CR", value: 1 },
        { scope: "NR", value: 1 },
      ],
    },
    average: {
      value: "0.93",
      ranks: [
        { scope: "WR", value: 5 },
        { scope: "CR", value: 1 },
        { scope: "NR", value: 1 },
      ],
    },
  },
  {
    eventId: "444",
    eventName: "4x4x4 Cube",
    single: {
      value: "19.02",
      ranks: [
        { scope: "WR", value: 24 },
        { scope: "CR", value: 6 },
        { scope: "NR", value: 2 },
      ],
    },
    average: {
      value: "23.37",
      ranks: [
        { scope: "WR", value: 28 },
        { scope: "CR", value: 8 },
        { scope: "NR", value: 2 },
      ],
    },
  },
  {
    eventId: "333bf",
    eventName: "3x3x3 Blindfolded",
    single: {
      value: "2:43.20",
      ranks: [
        { scope: "WR", value: 5726 },
        { scope: "CR", value: 1890 },
        { scope: "NR", value: 221 },
      ],
    },
  },
];

function PersonalBestRankColumn({
  scope,
  single,
  average,
}: {
  scope: PersonalBestRank["scope"];
  single: PersonalBest;
  average?: PersonalBest;
}) {
  const singleRank = single.ranks.find((rank) => rank.scope === scope);
  const averageRank = average?.ranks.find((rank) => rank.scope === scope);

  return (
    <div className="profilePersonalBestRankColumn">
      {singleRank && (
        <span
          className="profilePersonalBestRank"
          data-record={singleRank.value === 1 || undefined}
          data-scope={scope}
        >
          {new Intl.NumberFormat().format(singleRank.value)}
        </span>
      )}
      {averageRank && (
        <span
          className="profilePersonalBestRank"
          data-record={averageRank.value === 1 || undefined}
          data-scope={scope}
        >
          {new Intl.NumberFormat().format(averageRank.value)}
        </span>
      )}
    </div>
  );
}

export function PersonalBestsPreviewMock() {
  return (
    <StatPreviewTable>
      <div className="profilePersonalBestsMock">
        <div className="profilePersonalBestColumnHeaders" aria-hidden="true">
          <span />
          <span className="profilePersonalBestResultHeaders">
            <span>Single</span>
            <span>Average</span>
          </span>
          <span className="profilePersonalBestRankHeaders">
            <span>WR</span>
            <span>CR</span>
            <span>NR</span>
          </span>
        </div>
        {mockPersonalBests.map((entry) => (
          <section className="profilePersonalBestRow" key={entry.eventId}>
            <h3>
              <span
                className={`cubing-icon event-${entry.eventId}`}
                aria-hidden="true"
              />
              <span className="profilePersonalBestEventName">
                {entry.eventName}
              </span>
            </h3>
            <div className="profilePersonalBestValues">
              <strong>{entry.single.value}</strong>
              {entry.average && <strong>{entry.average.value}</strong>}
            </div>
            <div className="profilePersonalBestRanks">
              {(["WR", "CR", "NR"] as const).map((scope) => (
                <PersonalBestRankColumn
                  average={entry.average}
                  key={scope}
                  scope={scope}
                  single={entry.single}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </StatPreviewTable>
  );
}
