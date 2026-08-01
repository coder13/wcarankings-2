"use client";

import { useProjectionFeatureSwitch } from "@/components/ProjectionFeatureSwitchProvider";
import { TextDropdown } from "../Dropdown/TextDropdown";

export const EXPLORER_SUBJECTS = [
  { id: "people", label: "Rankings" },
  { id: "results", label: "Results" },
  { id: "competitions", label: "Competitions" },
  { id: "cities", label: "Cities" },
] as const;
export const NAVIGATION_SUBJECTS = [
  ...EXPLORER_SUBJECTS,
  { id: "lists", label: "Lists" },
] as const;

export type ExplorerSubject = (typeof EXPLORER_SUBJECTS)[number]["id"];
export type NavigationSubject = (typeof NAVIGATION_SUBJECTS)[number]["id"];

export function ExplorerSubjectSwitch({
  subject,
  onChange,
  variant = "segmented",
}: {
  subject: NavigationSubject;
  onChange: (subject: NavigationSubject) => void;
  variant?: "segmented" | "select" | "text" | "title";
}) {
  const featureSwitch = useProjectionFeatureSwitch();
  const subjects = NAVIGATION_SUBJECTS.filter((option) => {
    if (option.id === "lists") return true;
    if (!featureSwitch.core) return false;
    if (option.id === "results") return featureSwitch.resultRankings;
    if (option.id === "competitions") return featureSwitch.competitionRankings;
    if (option.id === "cities") return featureSwitch.cityEventStats;
    return true;
  });
  const dropdownOptions = subjects.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  if (variant === "title") {
    return (
      <TextDropdown
        options={dropdownOptions}
        value={subject}
        onChange={(value) => onChange(value as NavigationSubject)}
        ariaLabel="Browse WCA data"
        className="headerSubjectDropdown"
        triggerPrefix="WCA "
        hideSelectedOption={subject !== "lists"}
      />
    );
  }

  if (variant === "text") {
    return (
      <TextDropdown
        options={dropdownOptions}
        value={subject}
        onChange={(value) => onChange(value as NavigationSubject)}
        ariaLabel="Browse"
      />
    );
  }

  if (variant === "select") {
    return (
      <label className="ExplorerSubjectSelect">
        <span className="visuallyHidden">Browse</span>
        <select
          value={subject}
          aria-label="Browse"
          onChange={(event) =>
            onChange(event.target.value as NavigationSubject)
          }
        >
          {subjects.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="ExplorerSubjectSwitch" role="tablist" aria-label="Browse">
      {subjects.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={subject === option.id}
          className={subject === option.id ? "isSelected" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
