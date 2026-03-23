export interface VoiceMicButtonProps {
  disabled?: boolean;
  onFinalTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  onVolumeChange?: (level: number) => void;
  voiceEnabled?: boolean;
  className?: string;
  iconSize?: number;
  accessibilityLabelIdle?: string;
  accessibilityLabelActive?: string;
  label?: string;
  activeLabel?: string;
  iconColorIdle?: string;
  iconColorActive?: string;
  liveLevel?: number;
  showLiveIndicator?: boolean;
}
