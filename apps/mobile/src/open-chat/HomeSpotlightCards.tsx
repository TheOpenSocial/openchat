import type { ExperienceHomeSummaryResponse } from "../lib/api";

type HomeSpotlightCardsProps = {
  summary: ExperienceHomeSummaryResponse | null;
  onPressActivity?: () => void;
  onPressCoordination?: (targetChatId: string | null) => void;
  onPressLeadIntent?: (intentId: string) => void;
  onPressTopSuggestion?: (userId: string) => void;
};

export function HomeSpotlightCards({
  summary: _summary,
  onPressActivity: _onPressActivity,
  onPressCoordination: _onPressCoordination,
  onPressLeadIntent: _onPressLeadIntent,
  onPressTopSuggestion: _onPressTopSuggestion,
}: HomeSpotlightCardsProps) {
  void _summary;
  void _onPressActivity;
  void _onPressCoordination;
  void _onPressLeadIntent;
  void _onPressTopSuggestion;
  return null;
}
