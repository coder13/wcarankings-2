export type MedalCounts = {
  total: number;
  gold: number;
  silver: number;
  bronze: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function PersonMedalPreviewCounts({ counts }: { counts: MedalCounts }) {
  return (
    <dl className="profileMedalSummary">
      <div className="profileMedalSummaryTotal">
        <dt>Medals</dt>
        <dd>{formatCount(counts.total)}</dd>
      </div>
      <div className="profileMedalSummaryBreakdown">
        <div data-medal="gold">
          <dt>Gold</dt>
          <dd>{formatCount(counts.gold)}</dd>
        </div>
        <div data-medal="silver">
          <dt>Silver</dt>
          <dd>{formatCount(counts.silver)}</dd>
        </div>
        <div data-medal="bronze">
          <dt>Bronze</dt>
          <dd>{formatCount(counts.bronze)}</dd>
        </div>
      </div>
    </dl>
  );
}
