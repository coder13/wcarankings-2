import { TextDropdown } from "@/components/Dropdown/TextDropdown";

export function YearSelector({
  year,
  availableYears,
  onChange,
  className = "",
}: {
  year: number | null;
  availableYears: readonly number[];
  onChange: (year: number | null) => void;
  className?: string;
}) {
  const years =
    year !== null && !availableYears.includes(year)
      ? [year, ...availableYears]
      : availableYears;
  const options = [
    { value: "", label: "All time" },
    ...years.map((availableYear) => ({
      value: `${availableYear}`,
      label: `${availableYear}`,
    })),
  ];

  return (
    <TextDropdown
      options={options}
      value={year === null ? "" : `${year}`}
      onChange={(value) => onChange(value ? Number(value) : null)}
      ariaLabel="Year"
      className={className}
    />
  );
}
