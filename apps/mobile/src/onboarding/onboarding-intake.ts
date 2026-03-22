import { COUNTRY_OPTIONS } from "./country-options";
import {
  ONBOARDING_GOAL_OPTIONS,
  ONBOARDING_TOPIC_SUGGESTIONS,
  type OnboardingDraftState,
} from "./onboarding-model";

const GOAL_KEYWORDS: Array<{
  label: (typeof ONBOARDING_GOAL_OPTIONS)[number];
  keywords: string[];
}> = [
  {
    label: "Meet people",
    keywords: [
      "meet people",
      "meet new people",
      "make friends",
      "new people",
      "new friends",
    ],
  },
  {
    label: "Talk about interests",
    keywords: ["talk about", "chat about", "discuss", "conversation"],
  },
  {
    label: "Find things to do",
    keywords: [
      "things to do",
      "activities",
      "something to do",
      "what's happening",
    ],
  },
  {
    label: "Make plans",
    keywords: ["make plans", "plan", "tonight", "this weekend", "hang out"],
  },
  {
    label: "Join small groups",
    keywords: ["group", "small group", "circle", "community"],
  },
  {
    label: "Explore what’s happening",
    keywords: ["explore", "discover", "what's happening", "what is happening"],
  },
  { label: "Dating", keywords: ["dating", "date", "romantic"] },
  { label: "Gaming", keywords: ["gaming", "games", "gamer"] },
  {
    label: "Professional / ideas",
    keywords: [
      "professional",
      "founders",
      "startup",
      "ideas",
      "networking",
      "work",
    ],
  },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  Music: ["music", "concert", "songs", "dj"],
  Movies: ["movies", "film", "cinema"],
  Startups: ["startup", "founder", "saas", "venture"],
  Design: ["design", "product design", "ux", "ui", "creative"],
  Fitness: ["fitness", "gym", "workout"],
  Football: ["football", "soccer", "match"],
  "Table tennis": ["table tennis", "ping pong"],
  Gaming: ["gaming", "games", "playstation", "xbox"],
  Travel: ["travel", "trip", "travelling"],
  Crypto: ["crypto", "bitcoin", "ethereum", "web3"],
  Food: ["food", "restaurant", "dinner", "coffee"],
  Books: ["books", "reading", "book club"],
  AI: ["ai", "artificial intelligence", "machine learning"],
  Running: ["running", "run", "jogging"],
  Nightlife: ["nightlife", "party", "bar", "club"],
  "Language exchange": [
    "language exchange",
    "languages",
    "spanish",
    "english practice",
  ],
};

function dedupe(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function applyIntakeToDraft(
  current: OnboardingDraftState,
  rawText: string,
) {
  const text = rawText.trim();
  if (!text) {
    return current;
  }

  const lower = text.toLowerCase();
  const onboardingGoals = dedupe([
    ...current.onboardingGoals,
    ...GOAL_KEYWORDS.filter((row) =>
      row.keywords.some((keyword) => lower.includes(keyword)),
    ).map((row) => row.label),
  ]);

  const interests = dedupe([
    ...current.interests,
    ...ONBOARDING_TOPIC_SUGGESTIONS.filter((topic) => {
      const direct = lower.includes(topic.toLowerCase());
      const keywordHit = (TOPIC_KEYWORDS[topic] ?? []).some((keyword) =>
        lower.includes(keyword),
      );
      return direct || keywordHit;
    }),
  ]);

  const country =
    COUNTRY_OPTIONS.find((option) => lower.includes(option.toLowerCase())) ??
    current.country;

  let area = current.area;
  const areaMatch = text.match(
    /\b(?:in|around|near|from)\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)/,
  );
  if (areaMatch?.[1]) {
    area = areaMatch[1].trim();
  }

  const sentence =
    text
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? text;

  return {
    ...current,
    onboardingIntakeText: text,
    onboardingGoals,
    interests: interests.length > 0 ? interests : current.interests,
    area,
    country,
    shortBio:
      current.shortBio.trim().length > 0
        ? current.shortBio
        : sentence.slice(0, 160),
    firstIntentText:
      current.firstIntentText.trim().length > 0
        ? current.firstIntentText
        : text,
  };
}
