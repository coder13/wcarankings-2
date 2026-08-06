"use client";

import { useTranslation } from "react-i18next";
import type { RankingType } from "@/lib/wca";
import { i18n } from "@/lib/i18n";

export function ResultTypeToggle({
  value,
  disabled = false,
  onChange,
}: {
  value: RankingType;
  disabled?: boolean;
  onChange: (value: RankingType) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const nextValue = value === "single" ? "average" : "single";

  return (
    <button
      className="Jump-resultTypeToggle"
      type="button"
      disabled={disabled}
      aria-label={t("rankingsRail.controls.switchToRankingType", {
        rankingType: nextValue,
      })}
      onClick={() => onChange(nextValue)}
    >
      {t(`rankingsRail.controls.${value}`)}
    </button>
  );
}
