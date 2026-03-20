import { Chip } from "./ui/chip";

interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  testID,
}: ChoiceChipProps) {
  return (
    <Chip label={label} onPress={onPress} selected={selected} testID={testID} />
  );
}
