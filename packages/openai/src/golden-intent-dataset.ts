import { IntentType, IntentUrgency } from "@opensocial/types";

export interface GoldenIntentParsingCase {
  id: string;
  input: string;
  expected: {
    intentType: IntentType;
    urgency: IntentUrgency;
    modality?: "online" | "offline" | "either";
    groupSizeTarget?: number;
    topicsContains?: string[];
    activitiesContains?: string[];
    timingContains?: string[];
    skillContains?: string[];
    vibeContains?: string[];
  };
}

export const goldenIntentParsingDataset: GoldenIntentParsingCase[] = [
  {
    id: "group_tennis_tonight",
    input: "Need a group of 3 to play tennis tonight, beginner and chill",
    expected: {
      intentType: IntentType.GROUP,
      urgency: IntentUrgency.FLEXIBLE,
      groupSizeTarget: 3,
      topicsContains: ["tennis"],
      activitiesContains: ["play"],
      timingContains: ["tonight"],
      skillContains: ["beginner"],
      vibeContains: ["chill"],
    },
  },
  {
    id: "asap_online_chat",
    input: "Anyone online now for an AI chat on Discord?",
    expected: {
      intentType: IntentType.CHAT,
      urgency: IntentUrgency.NOW,
      modality: "online",
      topicsContains: ["ai"],
      activitiesContains: ["chat"],
      timingContains: ["now"],
    },
  },
  {
    id: "offline_coffee_meetup",
    input: "Looking to meet people near me for coffee after work",
    expected: {
      intentType: IntentType.GROUP,
      urgency: IntentUrgency.FLEXIBLE,
      modality: "offline",
      activitiesContains: ["meet", "coffee"],
      timingContains: ["after work"],
    },
  },
  {
    id: "basketball_players",
    input: "Need 4 people to play basketball this weekend",
    expected: {
      intentType: IntentType.GROUP,
      urgency: IntentUrgency.FLEXIBLE,
      groupSizeTarget: 4,
      topicsContains: ["basketball"],
      activitiesContains: ["play"],
      timingContains: ["weekend"],
    },
  },
  {
    id: "study_react_typescript",
    input: "Looking for React and TypeScript study partners tomorrow",
    expected: {
      intentType: IntentType.CHAT,
      urgency: IntentUrgency.FLEXIBLE,
      topicsContains: ["react", "typescript"],
      activitiesContains: ["study"],
      timingContains: ["tomorrow"],
    },
  },
];
