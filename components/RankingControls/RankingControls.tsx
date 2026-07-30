"use client";

import { WCA_EVENTS } from "@/lib/wca";
import { EventPicker } from "../EventPicker/EventPicker";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import type { RegionOption, RegionSelection } from "../RankingsExplorer/types";
import { GenderPicker } from "../GenderPicker/GenderPicker";
import type { GenderFilter } from "@/lib/wca";

export function RankingControls({
  eventId,
  rankingType,
  gender,
  regions,
  regionSelection,
  onEventChange,
  onRankingTypeChange,
  onGenderChange,
  onRegionChange,
  onEventPickerTrigger,
}: {
  eventId: (typeof WCA_EVENTS)[number]["id"];
  rankingType: "single" | "average";
  gender: readonly GenderFilter[];
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onEventChange: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  onGenderChange: (gender: GenderFilter[]) => void;
  onRegionChange: (region: RegionOption) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
}) {
  const selectedEvent = WCA_EVENTS.find((event) => event.id === eventId)!;

  return (
    <div className="chooser">
      <div className="chooserEventPicker">
        <EventPicker
          event={selectedEvent}
          onChange={onEventChange}
          onTriggerReady={onEventPickerTrigger}
        />
      </div>
      <div className="selectInput eventInput">
        <select
          name="Event Id"
          onChange={(event) =>
            onEventChange(event.target.value as (typeof WCA_EVENTS)[number]["id"])
          }
          value={eventId}
        >
          {WCA_EVENTS.map(({ id, shortName }) => (
            <option key={id} value={id}>
              {shortName}
            </option>
          ))}
        </select>
        <SelectChevronIcon />
      </div>
      <fieldset
        className="rankingTypeToggle"
        data-ranking-type={rankingType}
        aria-label="Ranking type"
      >
        <legend className="visuallyHidden">Ranking type</legend>
        {(["single", "average"] as const).map((option) => (
          <label
            className={`rankingTypeOption${rankingType === option ? " isSelected" : ""}${
              option === "average" && eventId === "333mbf" ? " isDisabled" : ""
            }`}
            key={option}
          >
            <input
              type="radio"
              name="Ranking type"
              value={option}
              checked={rankingType === option}
              disabled={option === "average" && eventId === "333mbf"}
              onChange={() => onRankingTypeChange(option)}
            />
            <span>{option === "single" ? "Single" : "Average"}</span>
          </label>
        ))}
      </fieldset>
      <GenderPicker value={gender} onChange={onGenderChange} />
      {regions.length > 0 && (
        <RegionPicker
          options={regions}
          selected={regionSelection}
          onChange={onRegionChange}
        />
      )}
    </div>
  );
}
