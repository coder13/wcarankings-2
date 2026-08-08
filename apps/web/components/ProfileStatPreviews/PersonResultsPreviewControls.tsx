import { EventPicker } from "@/components/EventPicker/EventPicker";
import {
  InputContainer,
  InputContainerItem,
} from "@/components/InputContainer/InputContainer";
import { ResultTypeToggle } from "@/components/RankingsRail/ResultTypeToggle";
import { YearSelector } from "@/components/RankingsRail/YearSelector";
import { WCA_EVENTS, type RankingType } from "@/lib/wca";

export function PersonResultsPreviewControls({
  eventId,
  resultType,
  year,
  availableYears,
  onEventChange,
  onResultTypeChange,
  onYearChange,
}: {
  eventId: string;
  resultType: RankingType;
  year: number | null;
  availableYears: readonly number[];
  onEventChange: (eventId: string) => void;
  onResultTypeChange: (resultType: RankingType) => void;
  onYearChange: (year: number | null) => void;
}) {
  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;

  return (
    <InputContainer className="profilePreviewSelectors">
      <InputContainerItem className="profilePreviewEventControl">
        <EventPicker event={event} onChange={onEventChange} />
      </InputContainerItem>
      <InputContainerItem
        className="Jump-resultTypeControl"
        width="var(--input-result-type-width)"
      >
        <ResultTypeToggle
          value={resultType}
          disabled={eventId === "333mbf"}
          onChange={onResultTypeChange}
        />
      </InputContainerItem>
      <InputContainerItem className="profilePreviewYearControl">
        <YearSelector
          year={year}
          availableYears={availableYears}
          onChange={onYearChange}
          className="profilePreviewYearPicker"
        />
      </InputContainerItem>
    </InputContainer>
  );
}
