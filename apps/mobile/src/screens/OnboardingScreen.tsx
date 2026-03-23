import { LinearGradient } from "expo-linear-gradient";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AgentSuggestionChips } from "../components/AgentSuggestionChips";
import { AnimatedScreen } from "../components/AnimatedScreen";
import { ChatBubble } from "../components/ChatBubble";
import { ChatTranscriptList } from "../components/ChatTranscriptList";
import { ChoiceChip } from "../components/ChoiceChip";
import { InlineNotice } from "../components/InlineNotice";
import { MessageComposer } from "../components/MessageComposer";
import { PrimaryButton } from "../components/PrimaryButton";
import { SystemBlobAnimation } from "../components/SystemBlobAnimation";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { api, type OnboardingInferenceResult } from "../lib/api";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import { pickProfilePhoto } from "../lib/profile-photo-upload";
import { speechRecognitionAvailable } from "../lib/speech-recognition-available";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "../onboarding-storage";
import {
  type OnboardingAvailability,
  type OnboardingFormat,
  type OnboardingMode,
  type OnboardingStyle,
  type ProfilePhotoDraft,
  type SocialMode,
  type UserProfileDraft,
} from "../types";

interface OnboardingScreenProps {
  accessToken?: string;
  userId: string;
  defaultName: string;
  onComplete: (profile: UserProfileDraft) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

type OnboardingStage = "start" | "review" | "refine" | "profile" | "intent";

type ConversationMessage = {
  id: string;
  role: "agent" | "user" | "system" | "workflow";
  body: string;
};

const stages: OnboardingStage[] = [
  "start",
  "review",
  "refine",
  "profile",
  "intent",
];

const goalOptions = [
  "Meet people",
  "Talk about interests",
  "Find things to do",
  "Make plans",
  "Join small groups",
  "Explore what's happening",
  "Dating",
  "Gaming",
  "Professional / ideas",
] as const;

const interestOptions = [
  "AI",
  "Design",
  "Football",
  "Gaming",
  "Running",
  "Startups",
  "Table tennis",
  "Film",
  "Music",
  "Coffee",
  "Fitness",
  "Books",
  "Travel",
  "Food",
  "Nightlife",
  "Language exchange",
] as const;

const availabilityOptions: Array<{
  label: string;
  value: OnboardingAvailability;
}> = [
  { label: "Now", value: "now" },
  { label: "Evenings", value: "evenings" },
  { label: "Weekends", value: "weekends" },
  { label: "Flexible", value: "flexible" },
];

const formatOptions: Array<{ label: string; value: OnboardingFormat }> = [
  { label: "1:1", value: "one_to_one" },
  { label: "Small groups", value: "small_groups" },
  { label: "Both", value: "both" },
];

const modeOptions: Array<{ label: string; value: OnboardingMode }> = [
  { label: "Social", value: "both" },
  { label: "Online", value: "online" },
  { label: "In person", value: "in_person" },
];

const styleOptions: Array<{ label: string; value: OnboardingStyle }> = [
  { label: "Chill", value: "chill" },
  { label: "Spontaneous", value: "spontaneous" },
  { label: "Planned", value: "planned" },
  { label: "Focused", value: "focused" },
];

const interestKeywords: Array<[string, readonly string[]]> = [
  ["AI", ["ai", "artificial intelligence", "machine learning"]],
  ["Design", ["design", "ux", "ui", "creative"]],
  ["Football", ["football", "soccer", "match"]],
  ["Gaming", ["gaming", "game", "apex", "playstation", "xbox"]],
  ["Running", ["running", "run", "jogging"]],
  ["Startups", ["startup", "founder", "saas", "venture"]],
  ["Film", ["film", "movie", "cinema"]],
  ["Music", ["music", "concert", "songs"]],
  ["Coffee", ["coffee", "cafe"]],
  ["Fitness", ["fitness", "gym", "workout"]],
  ["Books", ["books", "reading", "book club"]],
  ["Travel", ["travel", "trip"]],
  ["Food", ["food", "dinner", "restaurant"]],
  ["Language exchange", ["language", "english", "spanish"]],
] as const;

const copy = {
  en: {
    stageStart: "Getting to know you",
    stageReview: "Making sense of it",
    stageRefine: "Refine your setup",
    stageProfile: "Add a profile",
    stageIntent: "Almost ready",
    titleStart: "Start with intent.",
    subtitleStart:
      "Speak once. We’ll understand what you want, who you want to meet, and what matters next.",
    exampleLabel: "Example",
    exampleText:
      "I want to meet people who are into design and good conversations, and make plans this weekend.",
    voiceHint: "Voice-first. Edit and refine after.",
    speakToStart: "Speak to start",
    listening: "Listening…",
    manualTitle: "Manual is still here if you want it.",
    manualSubtitle:
      "Use the same thread, just start with text instead of voice.",
    manualCta: "Set it up manually",
    transcriptLabel: "What you said",
    summaryLabel: "What I'm understanding",
    followUpLabel: "One thing to clarify",
    followUpPlaceholder: "Add a short answer…",
    continueWithAnswer: "Use this and continue",
    continueToRefine: "Continue to refine",
    composerPlaceholder: "Share what you want your agent to help with…",
    trustLabel: "How confident this looks",
    summaryTitle: "What I've got so far",
    summarySubtitle: "You can adjust anything before you enter the product.",
    personaTitle: "Most likely fit",
    personaSubtitle:
      "This is a working read, not a fixed label. You can change it anytime.",
    profileTitle: "Add enough to feel real.",
    profileSubtitle:
      "A name, optional photo, and a little context help the first reply feel human.",
    intentTitle: "Give your agent a first move.",
    intentSubtitle:
      "This becomes the first thing your main thread can act on after onboarding.",
    nameLabel: "Name",
    bioLabel: "Short bio",
    areaLabel: "City or area",
    photoLabel: "Profile photo",
    photoIdle: "Optional, but it helps replies feel more personal.",
    photoReady: "We’ll upload this when onboarding finishes.",
    namePlaceholder: "Your name",
    bioPlaceholder: "A line or two if you want",
    areaPlaceholder: "City or area",
    intentPlaceholder:
      "I want to meet thoughtful people and actually make plans this week.",
    qualityStrong: "Strong signal",
    qualityLikely: "Likely",
    qualityReview: "Review",
    back: "Back",
    continue: "Continue",
    skip: "Skip",
    saveAndContinue: "Continue",
    skipIntent: "Skip for now",
    openingLibrary: "Opening library…",
    addPhoto: "Add a profile photo",
    photoSelected: "Photo selected",
    profileSignal: "Profile is taking shape",
    validationVoice: "Start with voice or choose the manual path.",
    validationFollowUp: "Add a quick answer or continue manually.",
    validationGoals: "Choose at least one goal.",
    validationInterests: "Choose at least one interest.",
    validationName: "Add the name people should see.",
  },
  es: {
    stageStart: "Conociéndote",
    stageReview: "Entendiendo tu señal",
    stageRefine: "Ajusta tu perfil",
    stageProfile: "Agrega un perfil",
    stageIntent: "Casi listo",
    titleStart: "Empieza con intención.",
    subtitleStart:
      "Habla una vez. Entenderemos qué quieres, a quién quieres conocer y qué importa después.",
    exampleLabel: "Ejemplo",
    exampleText:
      "Quiero conocer gente interesada en diseño y buenas conversaciones, y hacer planes este fin de semana.",
    voiceHint: "Primero voz. Después puedes ajustar.",
    speakToStart: "Habla para empezar",
    listening: "Escuchando…",
    manualTitle: "La ruta manual sigue aquí si la prefieres.",
    manualSubtitle:
      "Usa el mismo hilo, solo empieza con texto en lugar de voz.",
    manualCta: "Configúralo manualmente",
    transcriptLabel: "Lo que dijiste",
    summaryLabel: "Lo que estoy entendiendo",
    followUpLabel: "Una cosa para aclarar",
    followUpPlaceholder: "Agrega una respuesta corta…",
    continueWithAnswer: "Usar esto y continuar",
    continueToRefine: "Continuar para ajustar",
    composerPlaceholder:
      "Comparte qué quieres que tu agente te ayude a lograr…",
    trustLabel: "Qué tan claro se ve",
    summaryTitle: "Lo que tengo hasta ahora",
    summarySubtitle:
      "Puedes ajustar lo que quieras antes de entrar al producto.",
    personaTitle: "Lectura más probable",
    personaSubtitle:
      "Es una lectura inicial, no una etiqueta fija. Puedes cambiarla cuando quieras.",
    profileTitle: "Agrega lo suficiente para sentirse real.",
    profileSubtitle:
      "Un nombre, foto opcional y un poco de contexto ayudan a que la primera respuesta se sienta humana.",
    intentTitle: "Dale a tu agente un primer movimiento.",
    intentSubtitle:
      "Esto se convierte en lo primero que tu hilo principal puede mover después del onboarding.",
    nameLabel: "Nombre",
    bioLabel: "Bio corta",
    areaLabel: "Ciudad o zona",
    photoLabel: "Foto de perfil",
    photoIdle:
      "Es opcional, pero ayuda a que las respuestas se sientan más personales.",
    photoReady: "La subiremos cuando termine el onboarding.",
    namePlaceholder: "Tu nombre",
    bioPlaceholder: "Una o dos líneas si quieres",
    areaPlaceholder: "Ciudad o zona",
    intentPlaceholder:
      "Quiero conocer gente con la que pueda conversar bien y hacer planes esta semana.",
    qualityStrong: "Señal fuerte",
    qualityLikely: "Probable",
    qualityReview: "Revisar",
    back: "Atrás",
    continue: "Continuar",
    skip: "Omitir",
    saveAndContinue: "Continuar",
    skipIntent: "Omitir por ahora",
    openingLibrary: "Abriendo biblioteca…",
    addPhoto: "Agregar foto de perfil",
    photoSelected: "Foto seleccionada",
    profileSignal: "Tu perfil está tomando forma",
    validationVoice: "Empieza con voz o elige la ruta manual.",
    validationFollowUp: "Agrega una respuesta breve o continúa manualmente.",
    validationGoals: "Elige al menos un objetivo.",
    validationInterests: "Elige al menos un interés.",
    validationName: "Agrega el nombre que la gente verá.",
  },
} as const;

function resolveLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    return locale.startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function mapFormatToSocialMode(format: OnboardingFormat): SocialMode {
  if (format === "one_to_one") return "one_to_one";
  if (format === "small_groups") return "group";
  return "either";
}

function mapAvailabilityFromInference(
  value: OnboardingInferenceResult["availability"],
): OnboardingAvailability {
  switch (value) {
    case "Right now":
      return "now";
    case "Evenings":
      return "evenings";
    case "Weekends":
      return "weekends";
    default:
      return "flexible";
  }
}

function mapStyleFromInference(
  value: OnboardingInferenceResult["style"],
): OnboardingStyle {
  switch (value) {
    case "Spontaneous":
      return "spontaneous";
    case "Planned":
      return "planned";
    case "Focused":
      return "focused";
    default:
      return "chill";
  }
}

function mapModeToPreferredMode(
  value: OnboardingInferenceResult["mode"],
): OnboardingMode {
  if (value === "social") return "both";
  if (value === "dating") return "in_person";
  return "both";
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function fallbackInference(transcript: string): OnboardingInferenceResult {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();
  const interests = unique(
    interestKeywords
      .filter(([, keywords]) =>
        keywords.some((keyword) => lower.includes(keyword)),
      )
      .map(([label]) => label),
  ).slice(0, 10);
  const goals = unique([
    ...(lower.includes("meet") || lower.includes("people")
      ? ["Meet people"]
      : []),
    ...(lower.includes("plan") ||
    lower.includes("weekend") ||
    lower.includes("tonight")
      ? ["Make plans"]
      : []),
    ...(lower.includes("group") ? ["Join small groups"] : []),
    ...(lower.includes("dating") || lower.includes("date") ? ["Dating"] : []),
    ...(lower.includes("game") ? ["Gaming"] : []),
    ...(lower.includes("design") ||
    lower.includes("founder") ||
    lower.includes("ideas")
      ? ["Professional / ideas"]
      : []),
  ]).slice(0, 6);

  const format: OnboardingInferenceResult["format"] =
    /\b(1:1|one on one)\b/.test(lower)
      ? "one_to_one"
      : /\b(group|small group|circle)\b/.test(lower)
        ? "small_groups"
        : "both";
  const availability: OnboardingInferenceResult["availability"] =
    /\b(now|right now)\b/.test(lower)
      ? "Right now"
      : /\b(evening|tonight|after work)\b/.test(lower)
        ? "Evenings"
        : /\b(weekend)\b/.test(lower)
          ? "Weekends"
          : "Flexible";
  const style: OnboardingInferenceResult["style"] =
    /\b(planned|organized)\b/.test(lower)
      ? "Planned"
      : /\b(spontaneous|random)\b/.test(lower)
        ? "Spontaneous"
        : /\b(focused|serious)\b/.test(lower)
          ? "Focused"
          : "Chill";
  const areaMatch = raw.match(
    /\b(?:in|around|near|from)\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)/,
  );
  const area = areaMatch?.[1]?.trim() ?? "";
  const persona =
    goals.includes("Make plans") && goals.includes("Meet people")
      ? "Connector"
      : interests.includes("Design") ||
          interests.includes("AI") ||
          goals.includes("Professional / ideas")
        ? "Researcher"
        : format === "small_groups"
          ? "Social Builder"
          : style === "Planned"
            ? "Planner"
            : "Explorer";
  const summary = [
    goals.length > 0
      ? goals.slice(0, 2).join(" and ").toLowerCase()
      : "move something social forward",
    format === "one_to_one"
      ? "mostly 1:1"
      : format === "small_groups"
        ? "mostly in small groups"
        : "across 1:1 and small groups",
    availability === "Flexible"
      ? ""
      : `with a ${availability.toLowerCase()} bias`,
    area ? `around ${area}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    transcript: raw,
    interests,
    goals,
    mode: lower.includes("dating") ? "dating" : "social",
    format,
    style,
    availability,
    area,
    country: "",
    summary:
      summary.length > 0
        ? summary
        : "Looking to meet the right people and make something happen.",
    persona,
    firstIntent: raw,
    ...(goals.length === 0 || interests.length === 0
      ? {
          followUpQuestion:
            "What matters most here: who you want to meet, what you want to do, or what you want to talk about?",
        }
      : {}),
    inferenceMeta: {
      goals: {
        source: "voice",
        confidence: goals.length > 0 ? 0.72 : 0.42,
        needsConfirmation: goals.length === 0,
      },
      interests: {
        source: "voice",
        confidence: interests.length > 0 ? 0.74 : 0.4,
        needsConfirmation: interests.length < 2,
      },
      format: {
        source: "inferred",
        confidence: format === "both" ? 0.48 : 0.7,
        needsConfirmation: format === "both",
      },
      mode: { source: "inferred", confidence: 0.58, needsConfirmation: false },
      style: {
        source: "inferred",
        confidence: style === "Chill" ? 0.45 : 0.62,
        needsConfirmation: style === "Chill",
      },
      availability: {
        source: "inferred",
        confidence: availability === "Flexible" ? 0.41 : 0.7,
        needsConfirmation: availability === "Flexible",
      },
      location: {
        source: "voice",
        confidence: area ? 0.68 : 0.24,
        needsConfirmation: !area,
      },
      firstIntent: {
        source: "voice",
        confidence: 0.9,
        needsConfirmation: false,
      },
      persona: { source: "inferred", confidence: 0.6, needsConfirmation: true },
    },
  };
}

function toneFromConfidence(confidence: number, needsConfirmation: boolean) {
  if (!needsConfirmation && confidence >= 0.72) return "strong";
  if (confidence >= 0.52) return "likely";
  return "review";
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
      {children}
    </Text>
  );
}

function AmbientBackdrop() {
  return (
    <View className="absolute inset-0 overflow-hidden">
      <LinearGradient
        colors={["rgba(151,206,255,0.12)", "rgba(151,206,255,0)"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          position: "absolute",
          top: -140,
          right: -60,
          width: 320,
          height: 320,
          borderRadius: 320,
        }}
      />
      <LinearGradient
        colors={["rgba(118,255,195,0.08)", "rgba(118,255,195,0)"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          position: "absolute",
          bottom: -180,
          left: -100,
          width: 340,
          height: 340,
          borderRadius: 340,
        }}
      />
    </View>
  );
}

function ConfidencePill({
  confidence,
  label,
}: {
  confidence: number;
  label: string;
}) {
  const tone = toneFromConfidence(confidence, confidence < 0.6);
  return (
    <View
      className={
        tone === "strong"
          ? "rounded-full border border-white/10 bg-white px-3 py-1"
          : tone === "likely"
            ? "rounded-full border border-white/12 bg-surfaceMuted/95 px-3 py-1"
            : "rounded-full border border-white/10 bg-surface px-3 py-1"
      }
    >
      <Text
        className={
          tone === "strong"
            ? "text-[12px] font-semibold text-black"
            : "text-[12px] font-semibold text-ink"
        }
      >
        {label}
      </Text>
    </View>
  );
}

function ProgressBar({ index }: { index: number }) {
  const progress = useMemo(
    () => Math.max(0.16, (index + 1) / stages.length),
    [index],
  );
  const animated = useMemo(() => new Animated.Value(progress), []);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: progress,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [animated, progress]);

  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-white/8">
      <Animated.View
        className="h-full origin-left rounded-full bg-white"
        style={{ transform: [{ scaleX: animated }] }}
      />
    </View>
  );
}

export function OnboardingScreen({
  accessToken,
  userId,
  defaultName,
  errorMessage,
  loading,
  onComplete,
}: OnboardingScreenProps) {
  const locale = useMemo(() => resolveLocale(), []);
  const c = copy[locale];
  const [stageIndex, setStageIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [conversationDraft, setConversationDraft] = useState("");
  const [inference, setInference] = useState<OnboardingInferenceResult | null>(
    null,
  );
  const [goals, setGoals] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [availability, setAvailability] =
    useState<OnboardingAvailability>("flexible");
  const [format, setFormat] = useState<OnboardingFormat>("both");
  const [mode, setMode] = useState<OnboardingMode>("both");
  const [style, setStyle] = useState<OnboardingStyle>("chill");
  const [name, setName] = useState(defaultName);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [firstIntentText, setFirstIntentText] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhotoDraft | null>(
    null,
  );
  const [inferenceLoading, setInferenceLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [manualStart, setManualStart] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);

  const activeStage = stages[stageIndex];
  const voiceSupported = useMemo(() => speechRecognitionAvailable(), []);
  const showVoiceStage =
    activeStage === "start" &&
    transcript.trim().length === 0 &&
    !manualStart &&
    !inferenceLoading;
  const orbScale = useMemo(() => new Animated.Value(1), []);
  const orbOpacity = useMemo(() => new Animated.Value(0.92), []);

  useEffect(() => {
    let mounted = true;
    void loadOnboardingDraft(userId)
      .then((draft) => {
        if (!mounted || !draft) return;
        setStageIndex(draft.stageIndex);
        setTranscript(draft.transcript);
        setFollowUpAnswer(draft.followUpAnswer);
        setInference(draft.inference);
        setGoals(draft.goals);
        setInterests(draft.interests);
        setAvailability(draft.availability);
        setFormat(draft.format);
        setMode(draft.mode);
        setStyle(draft.style);
        setName(draft.name || defaultName);
        setBio(draft.bio);
        setLocation(draft.location);
        setFirstIntentText(draft.firstIntentText);
        setProfilePhoto(draft.profilePhoto);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, [defaultName, userId]);

  useEffect(() => {
    if (!hydrated) return;
    void saveOnboardingDraft(userId, {
      stageIndex,
      transcript,
      followUpAnswer,
      inference,
      goals,
      interests,
      availability,
      format,
      mode,
      style,
      name,
      bio,
      location,
      firstIntentText,
      profilePhoto,
    }).catch(() => {});
  }, [
    availability,
    bio,
    firstIntentText,
    followUpAnswer,
    format,
    goals,
    hydrated,
    inference,
    interests,
    location,
    mode,
    name,
    profilePhoto,
    stageIndex,
    style,
    transcript,
    userId,
  ]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(orbScale, {
        toValue: voiceListening ? 1.06 : 1,
        duration: voiceListening ? 240 : 320,
        useNativeDriver: true,
      }),
      Animated.timing(orbOpacity, {
        toValue: voiceListening ? 1 : 0.92,
        duration: voiceListening ? 220 : 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [orbOpacity, orbScale, voiceListening]);

  const hydrateFromInference = (next: OnboardingInferenceResult) => {
    setInference(next);
    setTranscript(next.transcript);
    setGoals(next.goals);
    setInterests(next.interests);
    setAvailability(mapAvailabilityFromInference(next.availability));
    setFormat(next.format);
    setMode(mapModeToPreferredMode(next.mode));
    setStyle(mapStyleFromInference(next.style));
    setLocation([next.area, next.country].filter(Boolean).join(", "));
    setFirstIntentText(next.firstIntent || next.transcript);
  };

  const inferTranscript = async (rawTranscript: string) => {
    const trimmed = rawTranscript.trim();
    if (!trimmed) return;
    setInferenceLoading(true);
    setLocalError(null);
    try {
      const result = accessToken
        ? await api.inferOnboarding(userId, trimmed, accessToken)
        : fallbackInference(trimmed);
      hydrateFromInference(result);
      setConversationDraft("");
      setManualStart(false);
      setStageIndex(1);
      hapticImpact();
    } catch (error) {
      hydrateFromInference(fallbackInference(trimmed));
      setLocalError(String(error));
      setConversationDraft("");
      setManualStart(false);
      setStageIndex(1);
    } finally {
      setInferenceLoading(false);
    }
  };

  const conversationMessages = useMemo<ConversationMessage[]>(() => {
    const items: ConversationMessage[] = [
      {
        id: "agent_opening",
        role: "agent",
        body:
          locale === "es"
            ? "Cuéntame qué quieres hacer, a quién quieres conocer o qué te interesa."
            : "Tell me what you want to do, who you want to meet, or what you're into.",
      },
    ];

    if (transcript.trim()) {
      items.push({
        id: "user_transcript",
        role: "user",
        body: transcript.trim(),
      });
    }

    if (inferenceLoading) {
      items.push({
        id: "workflow_reading",
        role: "workflow",
        body:
          locale === "es"
            ? "Entendiendo tu señal"
            : "Understanding your signal",
      });
    }

    if (inference) {
      items.push({
        id: "system_summary",
        role: "system",
        body: `**${inference.persona}**\n\n${inference.summary}`,
      });
    }

    if (inference?.followUpQuestion) {
      items.push({
        id: "agent_follow_up",
        role: "agent",
        body: inference.followUpQuestion,
      });
    }

    if (followUpAnswer.trim()) {
      items.push({
        id: "user_follow_up",
        role: "user",
        body: followUpAnswer.trim(),
      });
    }

    return items;
  }, [followUpAnswer, inference, inferenceLoading, locale, transcript]);

  const validationMessage = useMemo(() => {
    if (activeStage === "start" && !transcript.trim()) return c.validationVoice;
    if (
      activeStage === "review" &&
      inference?.followUpQuestion &&
      followUpAnswer.trim().length === 0
    ) {
      return c.validationFollowUp;
    }
    if (activeStage === "refine" && goals.length === 0)
      return c.validationGoals;
    if (activeStage === "refine" && interests.length === 0)
      return c.validationInterests;
    if (activeStage === "profile" && name.trim().length === 0)
      return c.validationName;
    return null;
  }, [
    activeStage,
    c.validationFollowUp,
    c.validationGoals,
    c.validationInterests,
    c.validationName,
    c.validationVoice,
    followUpAnswer,
    goals.length,
    inference?.followUpQuestion,
    interests.length,
    name,
    transcript,
  ]);

  const canContinue = validationMessage === null;

  const toggleMultiSelect = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    hapticSelection();
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const buildDraft = (intentText: string | null): UserProfileDraft => ({
    displayName: name.trim(),
    bio: bio.trim(),
    city: location.split(",")[0]?.trim() ?? location.trim(),
    country: location.includes(",")
      ? location.split(",").slice(1).join(",").trim()
      : "",
    interests,
    socialMode: mapFormatToSocialMode(format),
    notificationMode: "live",
    onboardingGoals: goals,
    preferredAvailability: availability,
    preferredFormat: format,
    preferredMode: mode,
    preferredStyle: style,
    firstIntentText: intentText,
    timezone: resolveTimezone(),
    profilePhoto,
  });

  const handleBack = () => {
    Keyboard.dismiss();
    hapticSelection();
    setStageIndex((current) => Math.max(0, current - 1));
  };

  const handleContinue = async () => {
    setLocalError(null);
    Keyboard.dismiss();

    if (activeStage === "review") {
      if (inference?.followUpQuestion && followUpAnswer.trim()) {
        await inferTranscript(`${transcript.trim()}\n${followUpAnswer.trim()}`);
        setFollowUpAnswer("");
        setStageIndex(2);
        return;
      }
      setStageIndex(2);
      return;
    }

    if (activeStage !== "intent") {
      if (!canContinue) return;
      hapticImpact();
      setStageIndex((current) => Math.min(stages.length - 1, current + 1));
      return;
    }

    await onComplete(
      buildDraft(firstIntentText.trim() || transcript.trim() || null),
    );
  };

  const handleSkipIntent = async () => {
    setLocalError(null);
    await onComplete(buildDraft(transcript.trim() || null));
  };

  const handlePickProfilePhoto = async () => {
    setPhotoBusy(true);
    setLocalError(null);
    try {
      const nextPhoto = await pickProfilePhoto();
      if (nextPhoto) {
        hapticImpact();
        setProfilePhoto(nextPhoto);
      }
    } catch (error) {
      setLocalError(String(error));
    } finally {
      setPhotoBusy(false);
    }
  };

  const confidenceLabel = (confidence: number, needsConfirmation: boolean) => {
    const tone = toneFromConfidence(confidence, needsConfirmation);
    if (tone === "strong") return c.qualityStrong;
    if (tone === "likely") return c.qualityLikely;
    return c.qualityReview;
  };

  const handleConversationSend = async () => {
    const trimmed = conversationDraft.trim();
    if (!trimmed || inferenceLoading) {
      return;
    }

    if (activeStage === "start") {
      setTranscript(trimmed);
      await inferTranscript(trimmed);
      return;
    }

    if (activeStage === "review" && inference?.followUpQuestion) {
      setFollowUpAnswer(trimmed);
      await inferTranscript(`${transcript.trim()}\n${trimmed}`);
      setStageIndex(2);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" testID="onboarding-screen">
      <AmbientBackdrop />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <AnimatedScreen screenKey={activeStage}>
          <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
            <View className="flex-1 px-6 pt-4">
              <View className="mb-6 gap-3">
                <Text className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                  {activeStage === "start"
                    ? c.stageStart
                    : activeStage === "review"
                      ? c.stageReview
                      : activeStage === "refine"
                        ? c.stageRefine
                        : activeStage === "profile"
                          ? c.stageProfile
                          : c.stageIntent}
                </Text>
                <ProgressBar index={stageIndex} />
              </View>

              {errorMessage ? (
                <InlineNotice text={errorMessage} tone="error" />
              ) : null}
              {localError ? (
                <InlineNotice text={localError} tone="info" />
              ) : null}

              {activeStage === "start" || activeStage === "review" ? (
                <View className="mt-4 min-h-0 flex-1">
                  {showVoiceStage ? (
                    <View className="flex-1 justify-between pb-6 pt-2">
                      <View className="items-center px-2">
                        <Animated.View
                          style={{
                            transform: [{ scale: orbScale }],
                            opacity: orbOpacity,
                          }}
                        >
                          <LinearGradient
                            colors={[
                              "rgba(255,255,255,0.14)",
                              "rgba(255,255,255,0.02)",
                            ]}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={{
                              width: 224,
                              height: 224,
                              borderRadius: 999,
                              padding: 1,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <View
                              className="items-center justify-center rounded-full border border-white/6 bg-[#0d0d0f]"
                              style={{ width: 222, height: 222 }}
                            >
                              <SystemBlobAnimation size={196} />
                            </View>
                          </LinearGradient>
                        </Animated.View>

                        <View className="mt-9 items-center gap-3">
                          <Text className="text-center text-[34px] font-semibold leading-[38px] tracking-tight text-ink">
                            {c.titleStart}
                          </Text>
                          <Text className="max-w-[320px] text-center text-[15px] leading-[22px] text-muted">
                            {c.subtitleStart}
                          </Text>
                        </View>
                      </View>

                      <View className="gap-4">
                        <LinearGradient
                          colors={[
                            "rgba(255,255,255,0.08)",
                            "rgba(255,255,255,0.02)",
                          ]}
                          end={{ x: 1, y: 1 }}
                          start={{ x: 0, y: 0 }}
                          style={{ borderRadius: 28, padding: 1 }}
                        >
                          <View className="rounded-[27px] bg-surface px-5 py-5">
                            <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                              {c.exampleLabel}
                            </Text>
                            <Text className="mt-3 text-[17px] leading-[25px] tracking-[-0.01em] text-ink">
                              {c.exampleText}
                            </Text>
                          </View>
                        </LinearGradient>

                        <View className="rounded-[24px] border border-white/8 bg-surface/80 px-5 py-4">
                          <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            {c.voiceHint}
                          </Text>
                          <Text className="mt-2 text-[14px] leading-[21px] text-muted">
                            {voiceSupported ? c.manualSubtitle : c.manualTitle}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View className="mb-4 gap-2">
                        <Text className="text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
                          {c.titleStart}
                        </Text>
                        <Text className="text-[15px] leading-[22px] text-muted">
                          {c.subtitleStart}
                        </Text>
                      </View>
                      <View className="min-h-0 flex-1">
                        <ChatTranscriptList
                          messages={conversationMessages}
                          renderBubble={(message) => (
                            <ChatBubble
                              body={message.body}
                              role={message.role}
                            />
                          )}
                        />
                      </View>
                      <AgentSuggestionChips
                        onSelect={(next) => {
                          setManualStart(true);
                          setConversationDraft(next);
                        }}
                        visible={!transcript.trim() && !inferenceLoading}
                      />
                      {inference ? (
                        <View className="mb-2 mt-1 flex-row flex-wrap gap-2">
                          {(goals.length > 0 ? goals : interests)
                            .slice(0, 5)
                            .map((item) => (
                              <ConfidencePill
                                confidence={
                                  goals.includes(item)
                                    ? (inference.inferenceMeta.goals
                                        .confidence ?? 0.5)
                                    : (inference.inferenceMeta.interests
                                        .confidence ?? 0.5)
                                }
                                key={item}
                                label={item}
                              />
                            ))}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : (
                <ScrollView
                  className="mt-4 flex-1"
                  contentContainerStyle={{
                    paddingBottom: 28,
                    gap: 20,
                  }}
                  keyboardDismissMode={
                    Platform.OS === "ios" ? "interactive" : "on-drag"
                  }
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {activeStage === "refine" ? (
                    <View className="gap-6">
                      <View className="gap-3">
                        <Text className="text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
                          {c.stageRefine}
                        </Text>
                        <Text className="text-[15px] leading-[22px] text-muted">
                          {c.personaSubtitle}
                        </Text>
                      </View>

                      <View className="rounded-[28px] border border-white/8 bg-surface px-5 py-5">
                        <SectionLabel>{c.personaTitle}</SectionLabel>
                        <View className="flex-row items-center justify-between gap-4">
                          <Text className="flex-1 text-[20px] font-semibold tracking-tight text-ink">
                            {inference?.persona ?? "Explorer"}
                          </Text>
                          <ConfidencePill
                            confidence={
                              inference?.inferenceMeta.persona.confidence ??
                              0.45
                            }
                            label={confidenceLabel(
                              inference?.inferenceMeta.persona.confidence ??
                                0.45,
                              inference?.inferenceMeta.persona
                                .needsConfirmation ?? true,
                            )}
                          />
                        </View>
                        <Text className="mt-3 text-[15px] leading-[22px] text-muted">
                          {inference?.summary ??
                            "We’ll use this as a working read until your behavior gives us better signal."}
                        </Text>
                      </View>

                      <View className="rounded-[28px] border border-white/8 bg-surface px-5 py-5">
                        <SectionLabel>{c.profileSignal}</SectionLabel>
                        <View className="flex-row flex-wrap gap-2">
                          {goals.map((goal) => (
                            <ConfidencePill
                              confidence={
                                inference?.inferenceMeta.goals.confidence ?? 0.5
                              }
                              key={goal}
                              label={goal}
                            />
                          ))}
                          {interests.map((interest) => (
                            <ConfidencePill
                              confidence={
                                inference?.inferenceMeta.interests.confidence ??
                                0.5
                              }
                              key={interest}
                              label={interest}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Goals</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {goalOptions.map((goal) => (
                            <ChoiceChip
                              key={goal}
                              label={goal}
                              onPress={() => toggleMultiSelect(goal, setGoals)}
                              selected={goals.includes(goal)}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Interests</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {interestOptions.map((interest) => (
                            <ChoiceChip
                              key={interest}
                              label={interest}
                              onPress={() =>
                                toggleMultiSelect(interest, setInterests)
                              }
                              selected={interests.includes(interest)}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Availability</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {availabilityOptions.map((option) => (
                            <ChoiceChip
                              key={option.value}
                              label={option.label}
                              onPress={() => setAvailability(option.value)}
                              selected={availability === option.value}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Format</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {formatOptions.map((option) => (
                            <ChoiceChip
                              key={option.value}
                              label={option.label}
                              onPress={() => setFormat(option.value)}
                              selected={format === option.value}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Mode</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {modeOptions.map((option) => (
                            <ChoiceChip
                              key={option.value}
                              label={option.label}
                              onPress={() => setMode(option.value)}
                              selected={mode === option.value}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>Style</SectionLabel>
                        <View className="flex-row flex-wrap gap-3">
                          {styleOptions.map((option) => (
                            <ChoiceChip
                              key={option.value}
                              label={option.label}
                              onPress={() => setStyle(option.value)}
                              selected={style === option.value}
                            />
                          ))}
                        </View>
                      </View>

                      <View>
                        <SectionLabel>{c.areaLabel}</SectionLabel>
                        <TextInput
                          className="rounded-2xl border border-white/10 bg-surface px-4 py-4 text-[15px] text-ink"
                          onChangeText={setLocation}
                          placeholder={c.areaPlaceholder}
                          placeholderTextColor="#8e8e8e"
                          value={location}
                        />
                      </View>
                    </View>
                  ) : null}

                  {activeStage === "profile" ? (
                    <View className="gap-5">
                      <View className="gap-3">
                        <Text className="text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
                          {c.profileTitle}
                        </Text>
                        <Text className="text-[15px] leading-[22px] text-muted">
                          {c.profileSubtitle}
                        </Text>
                      </View>

                      <View>
                        <SectionLabel>{c.photoLabel}</SectionLabel>
                        <Pressable
                          className="rounded-[28px] border border-white/10 bg-surface px-5 py-5"
                          onPress={handlePickProfilePhoto}
                        >
                          <View className="flex-row items-center gap-4">
                            {profilePhoto ? (
                              <Image
                                source={{ uri: profilePhoto.uri }}
                                style={{
                                  width: 72,
                                  height: 72,
                                  borderRadius: 24,
                                }}
                              />
                            ) : (
                              <LinearGradient
                                colors={[
                                  "rgba(255,255,255,0.16)",
                                  "rgba(255,255,255,0.05)",
                                ]}
                                end={{ x: 1, y: 1 }}
                                start={{ x: 0, y: 0 }}
                                style={{
                                  width: 72,
                                  height: 72,
                                  borderRadius: 24,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text className="text-[22px] font-semibold text-ink">
                                  +
                                </Text>
                              </LinearGradient>
                            )}
                            <View className="flex-1">
                              <Text className="text-[16px] font-semibold text-ink">
                                {profilePhoto ? c.photoSelected : c.addPhoto}
                              </Text>
                              <Text className="mt-1 text-[14px] leading-[20px] text-muted">
                                {profilePhoto ? c.photoReady : c.photoIdle}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                        {photoBusy ? (
                          <Text className="mt-2 text-[13px] text-muted">
                            {c.openingLibrary}
                          </Text>
                        ) : null}
                      </View>

                      <View>
                        <SectionLabel>{c.nameLabel}</SectionLabel>
                        <TextInput
                          className="rounded-2xl border border-white/10 bg-surface px-4 py-4 text-[15px] text-ink"
                          onChangeText={setName}
                          placeholder={c.namePlaceholder}
                          placeholderTextColor="#8e8e8e"
                          returnKeyType="next"
                          value={name}
                        />
                      </View>

                      <View>
                        <SectionLabel>{c.bioLabel}</SectionLabel>
                        <TextInput
                          className="min-h-[120px] rounded-2xl border border-white/10 bg-surface px-4 py-4 text-[15px] leading-[22px] text-ink"
                          multiline
                          onChangeText={setBio}
                          placeholder={c.bioPlaceholder}
                          placeholderTextColor="#8e8e8e"
                          textAlignVertical="top"
                          value={bio}
                        />
                      </View>

                      <View>
                        <SectionLabel>{c.areaLabel}</SectionLabel>
                        <TextInput
                          className="rounded-2xl border border-white/10 bg-surface px-4 py-4 text-[15px] text-ink"
                          onChangeText={setLocation}
                          placeholder={c.areaPlaceholder}
                          placeholderTextColor="#8e8e8e"
                          value={location}
                        />
                      </View>
                    </View>
                  ) : null}

                  {activeStage === "intent" ? (
                    <View className="gap-5">
                      <View className="gap-3">
                        <Text className="text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
                          {c.intentTitle}
                        </Text>
                        <Text className="text-[15px] leading-[22px] text-muted">
                          {c.intentSubtitle}
                        </Text>
                      </View>

                      <LinearGradient
                        colors={[
                          "rgba(255,255,255,0.1)",
                          "rgba(255,255,255,0.04)",
                        ]}
                        end={{ x: 1, y: 1 }}
                        start={{ x: 0, y: 0 }}
                        style={{ borderRadius: 32, padding: 1 }}
                      >
                        <TextInput
                          className="min-h-[220px] rounded-[31px] bg-surface px-5 py-5 text-[17px] leading-[25px] text-ink"
                          multiline
                          onChangeText={setFirstIntentText}
                          placeholder={c.intentPlaceholder}
                          placeholderTextColor="#8e8e8e"
                          textAlignVertical="top"
                          value={firstIntentText}
                        />
                      </LinearGradient>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </AnimatedScreen>

        {activeStage === "start" || activeStage === "review" ? (
          <View className="border-t border-white/6 px-4 pb-4 pt-3">
            {validationMessage ? (
              <View className="mb-3">
                <InlineNotice text={validationMessage} tone="info" />
              </View>
            ) : null}
            {showVoiceStage ? (
              <View className="gap-3">
                {voiceSupported ? (
                  <VoiceMicButton
                    label={voiceListening ? c.listening : c.speakToStart}
                    onFinalTranscript={(line) => {
                      setTranscript(line);
                      void inferTranscript(line);
                    }}
                    onListeningChange={setVoiceListening}
                    size="pill"
                  />
                ) : (
                  <PrimaryButton
                    label={c.manualCta}
                    onPress={() => setManualStart(true)}
                    testID="onboarding-manual-entry-primary"
                  />
                )}
                {voiceSupported ? (
                  <PrimaryButton
                    label={c.manualCta}
                    onPress={() => {
                      setManualStart(true);
                      hapticSelection();
                    }}
                    testID="onboarding-manual-entry-button"
                    variant="ghost"
                  />
                ) : null}
              </View>
            ) : (
              <>
                <MessageComposer
                  canSend={
                    conversationDraft.trim().length > 0 && !inferenceLoading
                  }
                  inputClassName="py-2"
                  inputTestID="onboarding-conversation-input"
                  maxLength={400}
                  multiline
                  onChangeText={setConversationDraft}
                  onSend={handleConversationSend}
                  onVoiceTranscript={(line) => {
                    setConversationDraft((current) =>
                      current.trim().length > 0
                        ? `${current.trim()} ${line}`
                        : line,
                    );
                  }}
                  placeholder={c.composerPlaceholder}
                  sendAccessibilityLabel="Send onboarding message"
                  sendTestID="onboarding-send-button"
                  sending={inferenceLoading}
                  value={conversationDraft}
                />
                {activeStage === "review" ? (
                  <View className="mt-3">
                    <PrimaryButton
                      disabled={Boolean(inference?.followUpQuestion)}
                      label={c.continueToRefine}
                      loading={loading}
                      onPress={handleContinue}
                      testID="onboarding-continue-button"
                    />
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <View className="border-t border-white/6 px-6 pb-4 pt-4">
            {validationMessage ? (
              <View className="mb-3">
                <InlineNotice text={validationMessage} tone="info" />
              </View>
            ) : null}
            <View className="flex-row items-center gap-3">
              <Pressable
                className="h-12 items-center justify-center rounded-2xl border border-white/10 px-4"
                onPress={handleBack}
              >
                <Text className="text-[14px] font-medium text-muted">
                  {c.back}
                </Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton
                  disabled={!canContinue || inferenceLoading}
                  label={c.saveAndContinue}
                  loading={loading || inferenceLoading}
                  onPress={handleContinue}
                  testID="onboarding-continue-button"
                />
              </View>
            </View>
            {activeStage === "intent" ? (
              <View className="mt-3">
                <PrimaryButton
                  label={c.skipIntent}
                  loading={false}
                  onPress={handleSkipIntent}
                  variant="ghost"
                />
              </View>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
