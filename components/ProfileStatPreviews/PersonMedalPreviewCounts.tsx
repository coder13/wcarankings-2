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
        <div>
          <dt>Gold</dt>
          <dd>{formatCount(counts.gold)}</dd>
        </div>
        <div>
          <dt>Silver</dt>
          <dd>{formatCount(counts.silver)}</dd>
        </div>
        <div>
          <dt>Bronze</dt>
          <dd>{formatCount(counts.bronze)}</dd>
        </div>
      </div>
    </dl>
  );
}
