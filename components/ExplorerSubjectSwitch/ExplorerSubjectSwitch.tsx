"use client";

import { TextDropdown } from "../Dropdown/TextDropdown";
import { useProjectionFeatureSwitch } from "@/components/ProjectionFeatureSwitchProvider";

export const EXPLORER_SUBJECTS = [
  { id: "people", label: "Persons" },
  { id: "results", label: "Results" },
  { id: "competitions", label: "Competitions" },
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
  variant?: "segmented" | "select" | "text";
}) {
  const featureSwitch = useProjectionFeatureSwitch();
  const subjects = NAVIGATION_SUBJECTS.filter((option) => featureSwitch.core || option.id === "lists");
  if (variant === "text") {
    return (
      <TextDropdown
        options={subjects.map((option) => ({ value: option.id, label: option.label }))}
        value={subject}
        onChange={(value) => onChange(value as NavigationSubject)}
        ariaLabel="Browse"
      />
    );
  }

  if (variant === "select") {
    return (
      <label className={`ExplorerSubjectSelect${variant === "text" ? " ExplorerSubjectSelect--text" : ""}`}>
        <span className="visuallyHidden">Browse</span>
        <select
          value={subject}
          aria-label="Browse"
          onChange={(event) => onChange(event.target.value as NavigationSubject)}
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
