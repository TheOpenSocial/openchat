export type SplitDisplayName = {
  firstName: string;
  lastName: string;
};

export function splitDisplayName(displayName: string): SplitDisplayName {
  const normalized = displayName.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const [firstName, ...rest] = normalized.split(" ");

  return {
    firstName,
    lastName: rest.join(" "),
  };
}

export function joinDisplayName(input: SplitDisplayName): string {
  return [input.firstName.trim(), input.lastName.trim()]
    .filter((value) => value.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
