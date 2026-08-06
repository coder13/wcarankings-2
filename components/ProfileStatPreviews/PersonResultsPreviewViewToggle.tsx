export type PersonResultsPreviewView = "table" | "chart";

export function PersonResultsPreviewViewToggle({
  value,
  onChange,
}: {
  value: PersonResultsPreviewView;
  onChange: (value: PersonResultsPreviewView) => void;
}) {
  return (
    <div className="profilePreviewViewToggle" role="group" aria-label="View">
      <button
        type="button"
        aria-pressed={value === "table"}
        onClick={() => onChange("table")}
      >
        Table
      </button>
      <button
        type="button"
        aria-pressed={value === "chart"}
        onClick={() => onChange("chart")}
      >
        Chart
      </button>
    </div>
  );
}
