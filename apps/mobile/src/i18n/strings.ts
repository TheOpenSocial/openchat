export const supportedLocales = ["en", "es"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const catalogs = {
  en: {
    localeLabel: "Language",
    localeEnglish: "English",
    localeSpanish: "Spanish",
    commonOk: "OK",
    commonBack: "Back",
    commonStepOf: "Step {current} of {total}",
    commonChange: "Change",
    commonRemove: "Remove",
    commonRefresh: "Refresh",
    commonSearch: "Search",
    commonLoading: "Loading...",
    authTitle: "Agentic social.",
    authSubtitle: "Start with intent. We help you find your people.",
    authContinueWithGoogle: "Continue with Google",
    authContinuePreview: "Continue",
    authPreviewFootnote: "Preview data only. Nothing syncs.",
    authBrowserFootnote: "Opens in your browser, then returns here.",
    authSignInFailed: "Sign-in failed",
    authCouldNotSignIn: "Could not sign in",
    authPreviewTitle: "Preview",
    authPreviewSubtitle: "Sample flows and data. Stays on this device.",
    onboardingHowItWorksTitle: "How it works",
    onboardingHowItWorksBody:
      "You tell OpenSocial what you want to do, talk about, or explore. We use that signal to find relevant people, suggest the next step, and start the right conversation. Nothing is sent without your action.",
    onboardingHowItWorksCta: "How it works",
    onboardingEntryKicker: "OpenSocial",
    onboardingEntryTitle: "Start with your voice.",
    onboardingEntrySubtitle:
      "Speak once, and we’ll start shaping your onboarding around what matters.",
    onboardingEntryManual: "Continue manually",
    onboardingEntryListening: "Listening",
    onboardingEntryWaitingForVoice: "Waiting for your voice",
    onboardingEntryVoiceDetected: "Voice detected",
    onboardingEntryVoiceUnavailable:
      "Voice requires a dev build with speech recognition enabled.",
    onboardingHybridTitle: "Start with intent.",
    onboardingHybridSubtitle:
      "Tell us what you want, who you want to meet, or what you're into.",
    onboardingHybridPrimaryVoice: "Speak to start",
    onboardingHybridAnswerVoice: "Answer by voice",
    onboardingHybridTypeInstead: "Type instead",
    onboardingHybridManual: "Or set it up manually",
    onboardingHybridProcessing:
      "Building your starting profile from what you shared.",
    onboardingHybridProcessingTitle: "Setting things up",
    onboardingHybridProcessingLabel: "Preparing",
    onboardingHybridProcessingInline: "Setting things up",
    onboardingHybridProcessingHint: "This takes a few seconds.",
    onboardingHybridProcessingWordOne: "Understanding your intent.",
    onboardingHybridProcessingWordTwo: "Mapping your best starting point.",
    onboardingHybridProcessingWordThree: "Preparing your next step.",
    onboardingHybridExampleLabel: "Example",
    onboardingHybridExampleText:
      "“Looking for people nearby to share good conversations this week.”",
    onboardingHybridCapturedTitle: "You said",
    onboardingHybridCapturedHint: "We’re using this to shape the next step.",
    onboardingHybridFollowUpVoiceHint: "Speak your answer.",
    onboardingHybridFollowUpTitle: "One more thing",
    onboardingHybridFollowUpSubtitle:
      "We just need one more signal to keep shaping this.",
    onboardingHybridFollowUpHint:
      "Answer naturally. We’ll keep shaping this around you.",
    onboardingInferenceUnavailableTitle: "We couldn’t finish that read",
    onboardingInferenceUnavailableBody:
      "Please try again. We weren’t able to process that voice note yet.",
    onboardingRefinementUnavailableTitle: "We couldn’t refresh that yet",
    onboardingRefinementUnavailableBody:
      "Please try again. We weren’t able to update this yet.",
    onboardingRefineTitle: "Refine your setup",
    onboardingRefineSubtitle:
      "Sharpen the parts that matter most before we lock this in.",
    onboardingPersonaTitle: "What we understood.",
    onboardingPersonaSubtitle:
      "This is the shape your setup is taking from what you shared.",
    onboardingPersonaEdit: "Refine details",
    onboardingPersonaEditHint: "Adjust anything that feels off.",
    onboardingPersonaSignalTitle: "Signal snapshot",
    onboardingPersonaSignalGoals: "Goals",
    onboardingPersonaSignalInterests: "Interests",
    onboardingPersonaSignalFormat: "Format",
    onboardingPersonaSignalLocation: "Location",
    onboardingProfileOptionalTitle: "Add a profile (optional)",
    onboardingProfileOptionalSubtitle:
      "A few basics help people feel comfortable saying yes.",
    onboardingCountrySelectorEmpty: "No countries found.",
    onboardingCountrySelectorHint: "Search or scroll the full list.",
    onboardingStepOneTitle: "Agentic, for you.",
    onboardingStepOneSubtitle:
      "Tell us what you want to do, talk about, or explore.",
    onboardingIntakeLabel:
      "Describe what you want once, and we’ll set things up.",
    onboardingIntakeAgentPrompt:
      "Tell me what you want to do, who you want to meet, or what you're into.",
    onboardingIntakePlaceholder:
      "I’m in Buenos Aires, into design and football, and want to meet thoughtful people to make weekend plans with.",
    onboardingIntakePrimary: "Use this",
    onboardingIntakeGuided: "Set it up step by step",
    onboardingIntakeVoiceHint: "Speak to get started.",
    onboardingIntakeSummary: "What I've understood so far",
    onboardingIntakeSummaryEmpty:
      "Still listening. Share a little more and I’ll shape this with you.",
    onboardingIntakeDone: "Done",
    onboardingIntakeSend: "Send onboarding message",
    onboardingIntakeReady: "Looks good",
    onboardingIntakeReadyHint:
      "We have enough to shape your profile and first intent.",
    onboardingStepTwoTitle: "Tell us about your goals.",
    onboardingStepTwoSubtitle: "Pick what you want help with first.",
    onboardingStepThreeTitle: "What are you into?",
    onboardingStepThreeSubtitle:
      "Choose a few topics so we can start in the right place.",
    onboardingStepFourTitle: "How do you like to connect?",
    onboardingStepFourSubtitle: "Optional: choose 1:1, groups, or both.",
    onboardingStepFiveTitle: "Set up your profile",
    onboardingStepFiveSubtitle:
      "A few basics help people feel comfortable saying yes.",
    onboardingStepSixTitle: "What do you want right now?",
    onboardingStepSixSubtitle:
      "Start with anything. A topic, a plan, or someone you want to meet.",
    onboardingContinue: "Continue",
    onboardingTryIt: "Try it",
    onboardingSkip: "Skip for now",
    onboardingSearchOrAddTopic: "Search or add a topic",
    onboardingPhotosTitle: "Photos",
    onboardingPhotosPermissionBody:
      "Allow photo access to add a profile picture, or skip for now.",
    onboardingProfilePhotoLabel: "Profile photo",
    onboardingProfilePhotoHint: "Opens your photo library",
    onboardingAddPhoto: "Add photo",
    onboardingProfileNameLabel: "Name",
    onboardingProfileNamePlaceholder: "Your name",
    onboardingProfileBioLabel: "Short bio (optional)",
    onboardingProfileBioPlaceholder:
      "Into football, design, and late coffee walks.",
    onboardingProfileBioHelper: "Optional. A short line is enough.",
    onboardingProfileAreaLabel: "City or area",
    onboardingProfileAreaPlaceholder: "e.g. Shoreditch, London",
    onboardingProfileCountryLabel: "Country or region",
    onboardingProfileCountryPlaceholder: "e.g. United Kingdom",
    onboardingProfileCountryHelper: "We’ll use your device region when we can.",
    onboardingIntentPlaceholder: "I want to talk about last night’s match…",
    onboardingIntentExamples:
      "Examples: find people to play tonight · meet others into design · go running this weekend · talk to other founders",
    offlineNotice: "You're offline — reconnect to sync.",
    sendBlockedOffline: "Can't send while offline.",
    agentComposerModeChat: "Chat",
    agentComposerModeIntent: "Plans & intents",
    agentHistoryLoading: "Loading your conversation…",
    agentWorkflowThinking: "Thinking…",
    agentWorkflowRouting: "Finding the right path…",
    agentComposerHintChat:
      "Message here for replies and next steps in this thread.",
    agentComposerHintIntent:
      "Describe what you want to do—we’ll route it to the right people.",
    agentImageUrlOptional:
      "Image link (optional) — attach a picture if it helps.",
    homeTabHome: "Home",
    homeTabChats: "Chats",
    homeTabProfile: "Profile",
    homeTabHomeHint: "Plans and chat",
    homeTabChatsHint: "Your conversations",
    homeTabProfileHint: "Account and settings",
    homeTabHomeDescription:
      "Plan, chat, and follow along as things move forward.",
    homeTabChatsDescription:
      "Private threads with people you’ve connected with.",
    homeTabProfileDescription: "Preferences, notifications, and account.",
    homeDrawerCloseMenu: "Close menu",
    homeDrawerDismissMenu: "Dismiss menu",
    homeDrawerNewConversation: "New conversation",
    homeDrawerNewConversationBody:
      "Clear this conversation and start fresh on this device.",
    homeDrawerNavigate: "Navigate",
    homeQueuedActions: "{count} action{plural} queued for sync.",
    homeAgentSeedPrompt:
      "What would you like to do today, or who would you like to meet?",
    homeThreadLoadFailedTitle: "Could not load your conversation",
    homeThreadLoadFailedBody:
      "The main conversation did not load correctly. Try again.",
    homeThreadRetryCta: "Retry",
    homeThreadRecoveryKicker: "Agentic social",
    homeThreadRecoveryTitle: "Reconnecting your main thread",
    homeThreadRecoveryBody:
      "I’m restoring your conversation and will place it back here as soon as the thread responds.",
    homeThreadRecoveryWaitingTitle: "Waiting to reconnect your main thread",
    homeThreadRecoveryWaitingBody:
      "I’m keeping this conversation ready and will reconnect as soon as the thread is available.",
    homeThreadRetryingCountdown:
      "Reconnecting to your main thread in {seconds}s · attempt {attempt}",
    homeThreadRetryManualHint:
      "If this keeps happening, retry once the connection settles.",
    openChatPresenceTitle: "Agentic social",
    openChatPresenceSubtitle: "Ready when you are.",
    openChatEmptyTitle: "What do you want to do?",
    openChatEmptySubtitle:
      "Start with anything. A topic, a plan, or someone you want to meet.",
    homeWelcomeTitle: "Start with intent.",
    homeWelcomeSubtitle:
      "Tell OpenSocial what you want to do, who you want to meet, or what kind of conversation you want next.",
    homeWelcomeHowItWorksTitle: "How it works",
    homeWelcomeHowItWorksBody:
      "You write once. OpenSocial interprets the signal, looks for the right people, and keeps the thread moving.",
    homeWelcomeExamplesTitle: "What to say",
    homeWelcomeExamplesBody:
      "Use natural language. A plan, a topic, a vibe, or the kind of person you want to meet is enough.",
    homeWelcomeChatsTitle: "What happens next",
    homeWelcomeChatsBody:
      "When people accept, chats open automatically. You stay in one thread until something is ready.",
    homeWelcomeTryTitle: "Try one",
    homeWelcomeTryHint: "Use this as your first message",
    homeWelcomePrimaryCta: "Try it now",
    homeWelcomeSkip: "Skip",
    openChatOnboardingCarryoverTitle: "Picked up from onboarding",
    openChatOnboardingCarryoverProcessing:
      "We’re carrying your first intent into your thread.",
    openChatOnboardingCarryoverReady:
      "Your thread is starting from what you already said.",
    openChatOnboardingCarryoverQueued:
      "Your first intent is saved and will send as soon as you’re back online.",
    openChatOnboardingCarryoverStartNow: "Start from this",
    openChatOnboardingCarryoverRetry: "Try sending now",
    openChatOnboardingCarryoverProcessingInline: "Starting your thread…",
    openChatOnboardingHandoffTitle: "Starting your thread",
    openChatOnboardingHandoffSubtitle:
      "We’re turning your onboarding signal into your first conversation.",
    openChatSuggestions: "Suggestions",
    openChatActionOpenChats: "Open chats",
    openChatActionWiden: "Widen search",
    openChatActionOneToOne: "Keep 1:1",
    openChatActionGroupsOk: "Small groups OK",
    openChatMoreOptions: "More options",
    openChatHideOptions: "Hide options",
    openChatSplitIntent: "Split broad message into multiple intents",
    openChatOn: "ON",
    openChatOff: "OFF",
    openChatMaxIntents: "Max intents (1-5)",
    openChatComposerPlaceholder: "What do you want to do or talk about?",
    openChatSendMessage: "Send message",
    openChatInlineFootball: "Talk about football",
    openChatInlineFootballBody:
      "I want to talk about football with people who follow it.",
    openChatInlineTonight: "Find people for tonight",
    openChatInlineTonightBody: "Find people who are free to hang out tonight.",
    openChatInlineMeet: "Meet someone new",
    openChatInlineMeetBody:
      "I want to meet someone new around a shared interest.",
    openChatInlineGroup: "Start a group",
    openChatInlineGroupBody:
      "I’m open to a small group around something I care about.",
    openChatInlineExplore: "Explore",
    openChatInlineExploreBody: "What’s happening that fits my interests?",
    chatsRealtimeLive: "Realtime: live",
    chatsRealtimeConnecting: "Realtime: connecting",
    chatsRealtimeOffline: "Realtime: offline (polling fallback active)",
    chatsDm: "DM",
    chatsGroup: "Group",
    chatsCreateGroupSandbox: "Create Group Sandbox",
    chatsCreateChatSandbox: "Create Chat Sandbox",
    chatsSyncNow: "Sync Now",
    chatsSyncingNow: "Syncing...",
    chatsEmptyTitle: "No chats yet",
    chatsEmptyDescription:
      "Create a chat sandbox to test message persistence using the live API.",
    chatsUnread: "{count} unread",
    chatsReportUser: "Report user",
    chatsBlockUser: "Block user",
    chatsNoMessages: "No messages yet in this thread.",
    chatsSyncingLatest: "Syncing latest messages...",
    chatsSomeoneTyping: "Someone is typing...",
    chatsPeopleTyping: "{count} people are typing...",
    chatsMessagePlaceholder: "Message…",
    chatsSendMessage: "Send chat message",
    profileInterests: "Interests",
    profileDefaultSocialMode: "Default social mode",
    profileModeGroup: "Group",
    profileModeFlexible: "Flexible",
    profileNotifications: "Notifications",
    profileLiveAlerts: "Live alerts",
    profileDigestMode: "Digest mode",
    profilePushStatus: "push: {status}",
    profileTokenStatus: "token: {status}",
    profileEnabled: "enabled",
    profileDisabled: "disabled",
    profileNotRegistered: "not registered",
    profileTrustSummary: "Trust summary",
    profileDiscoverySnapshot: "Discovery snapshot",
    profileRefreshing: "Refreshing...",
    profileTonightReconnects: "tonight: {tonight} · reconnects: {reconnects}",
    profileNoTonightSuggestions: "No tonight suggestions yet.",
    profilePublishToAgent: "Publish to agent thread",
    profileContinuityReconnect: "Continuity and reconnect",
    profilePendingRequestSuggestions: "pending request suggestions: {count}",
    profileNoReconnectSuggestions: "No reconnect suggestions yet.",
    profileWhyThisRoutingResult: "Why this routing result",
    profileLoadingExplanation: "Loading explanation...",
    profileNoIntentsToExplain: "No active intents available to explain yet.",
    profileSearchPlaceholder: "tennis, startups, design...",
    profileSearching: "Searching...",
    profileSearchCounts:
      "users {users} · topics {topics} · activities {activities} · groups {groups}",
    profileMemoryControls: "Memory controls",
    profileRefreshMemorySnapshot: "Refresh memory snapshot",
    profileResetLearnedMemory: "Reset learned memory",
    profileMemoryLoaded:
      "life graph loaded: {lifeGraph} · retrieval loaded: {retrieval}",
    profileYes: "yes",
    profileNo: "no",
    profileAutomations: "Automations",
    profileAutomationsBody: "Saved searches and scheduled briefings.",
    profileNewSavedSearch: "New saved search",
    profileNewAutomation: "New automation",
    profileRunNow: "Run now",
    profileSavedSearchesTasks: "saved searches: {searches} · tasks: {tasks}",
    profileNoRunsYet: "No runs yet.",
    profileRecurringCircles: "Recurring circles",
    profileNew: "New",
    profileLoadingCircles: "Loading circles...",
    profileNoCircles: "No circles yet. Create one to start recurring sessions.",
    profileNextScheduled: "not scheduled",
    profileSelectCircle: "Select a circle",
    profileOpenNow: "Open now",
    profileNoRecentSessions: "No recent sessions.",
    profileLocalTelemetry: "Local telemetry",
    profileEvents: "events: {count}",
    profileLast: "last: {value}",
    profileNa: "n/a",
    profileTelemetryIntents:
      "intents: {intents} · requests sent: {sent} · responded: {responded}",
    profileTelemetryChats:
      "chats started: {started} · first messages: {messages}",
    profileTelemetryModeration: "reports: {reports} · blocked users: {blocked}",
    profileTelemetryIntentMetrics:
      "intent→accept: {accept} · intent→first msg: {firstMessage}",
    profileTelemetryConnectionMetrics:
      "connection success: {success} · group completion: {completion}",
    profileTelemetryNotificationMetrics:
      "notification→open: {open} · moderation incidence: {incidence}",
    profileTelemetrySyncMetrics: "sync failure: {failure} · repeat: {repeat}",
    profileTelemetryActivationMetrics:
      "activation ready: {ready} · started: {started} · success: {success} · queued: {queued} · failed: {failed} · avg completion: {avg} · success rate: {successRate}",
    profileActivationHealthNoData:
      "Activation health: collecting enough signal from first activations.",
    profileActivationHealthHealthy:
      "Activation health: strong. Most users complete first activation successfully.",
    profileActivationHealthWatch:
      "Activation health: watch. Queueing or retries are elevated.",
    profileActivationHealthCritical:
      "Activation health: critical. First activation failures are elevated.",
    profileSaveSettings: "Save settings",
    profileRequestDigestNow: "Request digest now",
    profileSignOut: "Sign out",
    loadingYourSpace: "Loading your space…",
    authSessionExpired: "Session expired. Sign in again.",
    authSessionExpiredContinueOnboarding:
      "Session expired. Sign in again to continue onboarding.",
    authOfflineRestored:
      "You’re offline. Restored your last session state and will sync when internet returns.",
    onboardingMissingSession: "Missing authenticated session.",
    onboardingSavedLocally:
      "Saved locally. We’ll finish syncing your onboarding when internet is back.",
    onboardingPhotoUploadFailed: "Photo not uploaded",
    onboardingBackdropKicker: "Agentic onboarding",
  },
  es: {
    localeLabel: "Idioma",
    localeEnglish: "Inglés",
    localeSpanish: "Español",
    commonOk: "OK",
    commonBack: "Atrás",
    commonStepOf: "Paso {current} de {total}",
    commonChange: "Cambiar",
    commonRemove: "Eliminar",
    commonRefresh: "Actualizar",
    commonSearch: "Buscar",
    commonLoading: "Cargando...",
    authTitle: "Social agentico.",
    authSubtitle: "Empieza con intención. Te ayudamos a encontrar a tu gente.",
    authContinueWithGoogle: "Continuar con Google",
    authContinuePreview: "Continuar",
    authPreviewFootnote: "Solo datos de prueba. Nada se sincroniza.",
    authBrowserFootnote: "Se abre en tu navegador y luego vuelve aquí.",
    authSignInFailed: "Error al iniciar sesión",
    authCouldNotSignIn: "No se pudo iniciar sesión",
    authPreviewTitle: "Vista previa",
    authPreviewSubtitle:
      "Flujos y datos de muestra. Se quedan en este dispositivo.",
    onboardingHowItWorksTitle: "Cómo funciona",
    onboardingHowItWorksBody:
      "Nos dices qué quieres hacer, conversar o explorar. Usamos esa señal para encontrar personas relevantes, sugerir el siguiente paso e iniciar la conversación correcta. Nada se envía sin tu acción.",
    onboardingHowItWorksCta: "Cómo funciona",
    onboardingEntryKicker: "OpenSocial",
    onboardingEntryTitle: "Empieza con tu voz.",
    onboardingEntrySubtitle:
      "Habla una vez y empezaremos a armar tu onboarding alrededor de lo que importa.",
    onboardingEntryManual: "Continuar manualmente",
    onboardingEntryListening: "Escuchando",
    onboardingEntryWaitingForVoice: "Esperando tu voz",
    onboardingEntryVoiceDetected: "Voz detectada",
    onboardingEntryVoiceUnavailable:
      "La voz requiere un dev build con reconocimiento activado.",
    onboardingHybridTitle: "Empieza con intención.",
    onboardingHybridSubtitle:
      "Cuéntanos qué quieres, a quién quieres conocer o qué te interesa.",
    onboardingHybridPrimaryVoice: "Hablar para empezar",
    onboardingHybridAnswerVoice: "Responde con voz",
    onboardingHybridTypeInstead: "Escribir en su lugar",
    onboardingHybridManual: "O configurarlo manualmente",
    onboardingHybridProcessing:
      "Estamos armando tu perfil inicial con lo que compartiste.",
    onboardingHybridProcessingTitle: "Dejándolo listo",
    onboardingHybridProcessingLabel: "Preparando",
    onboardingHybridProcessingInline: "Dejándolo listo",
    onboardingHybridProcessingHint: "Esto tarda solo unos segundos.",
    onboardingHybridProcessingWordOne: "Entendiendo tu intención.",
    onboardingHybridProcessingWordTwo: "Armando tu mejor punto de inicio.",
    onboardingHybridProcessingWordThree: "Preparando el siguiente paso.",
    onboardingHybridExampleLabel: "Ejemplo",
    onboardingHybridExampleText:
      "“Quiero conocer gente cerca para tener buenas charlas esta semana.”",
    onboardingHybridCapturedTitle: "Dijiste",
    onboardingHybridCapturedHint:
      "Estamos usando esto para dar forma al siguiente paso.",
    onboardingHybridFollowUpVoiceHint: "Responde con tu voz.",
    onboardingHybridFollowUpTitle: "Una cosa más",
    onboardingHybridFollowUpSubtitle:
      "Solo necesitamos una señal más para seguir armándolo.",
    onboardingHybridFollowUpHint:
      "Responde de forma natural. Seguiremos armándolo contigo.",
    onboardingInferenceUnavailableTitle: "No pudimos terminar esa lectura",
    onboardingInferenceUnavailableBody:
      "Inténtalo de nuevo. No pudimos procesar esa nota de voz todavía.",
    onboardingRefinementUnavailableTitle: "No pudimos actualizar eso todavía",
    onboardingRefinementUnavailableBody:
      "Inténtalo de nuevo. Todavía no pudimos actualizar esto.",
    onboardingRefineTitle: "Refina tu configuración",
    onboardingRefineSubtitle:
      "Afina las partes que más importan antes de dejar esto listo.",
    onboardingPersonaTitle: "Lo que entendimos.",
    onboardingPersonaSubtitle:
      "Esta es la forma que está tomando tu configuración a partir de lo que compartiste.",
    onboardingPersonaEdit: "Refinar detalles",
    onboardingPersonaEditHint: "Ajusta cualquier cosa que no encaje.",
    onboardingPersonaSignalTitle: "Resumen de señales",
    onboardingPersonaSignalGoals: "Objetivos",
    onboardingPersonaSignalInterests: "Intereses",
    onboardingPersonaSignalFormat: "Formato",
    onboardingPersonaSignalLocation: "Ubicación",
    onboardingProfileOptionalTitle: "Agrega un perfil (opcional)",
    onboardingProfileOptionalSubtitle:
      "Algunos datos básicos ayudan a que otros se sientan cómodos diciendo que sí.",
    onboardingCountrySelectorEmpty: "No encontramos países.",
    onboardingCountrySelectorHint: "Busca o recorre la lista completa.",
    onboardingStepOneTitle: "Agéntico, para ti.",
    onboardingStepOneSubtitle:
      "Cuéntanos qué quieres hacer, hablar o explorar.",
    onboardingIntakeLabel:
      "Descríbenos una vez lo que quieres y lo configuramos por ti.",
    onboardingIntakeAgentPrompt:
      "Cuéntame qué quieres hacer, a quién quieres conocer o qué te interesa.",
    onboardingIntakePlaceholder:
      "Estoy en Buenos Aires, me gusta el diseño y el fútbol, y quiero conocer gente con calma para hacer planes el fin de semana.",
    onboardingIntakePrimary: "Usar esto",
    onboardingIntakeGuided: "Configurar paso a paso",
    onboardingIntakeVoiceHint: "Habla para empezar.",
    onboardingIntakeSummary: "Lo que ya entendí",
    onboardingIntakeSummaryEmpty:
      "Sigo escuchando. Cuéntame un poco más y lo armamos contigo.",
    onboardingIntakeDone: "Listo",
    onboardingIntakeSend: "Enviar mensaje de onboarding",
    onboardingIntakeReady: "Se ve bien",
    onboardingIntakeReadyHint:
      "Ya tenemos suficiente para armar tu perfil y tu primera intención.",
    onboardingStepTwoTitle: "Cuéntanos tus objetivos.",
    onboardingStepTwoSubtitle: "Elige primero en qué quieres recibir ayuda.",
    onboardingStepThreeTitle: "¿Qué te interesa?",
    onboardingStepThreeSubtitle:
      "Elige algunos temas para empezar en el lugar correcto.",
    onboardingStepFourTitle: "¿Cómo te gusta conectar?",
    onboardingStepFourSubtitle: "Opcional: elige 1:1, grupos o ambos.",
    onboardingStepFiveTitle: "Configura tu perfil",
    onboardingStepFiveSubtitle:
      "Algunos datos básicos ayudan a que otros digan que sí con más confianza.",
    onboardingStepSixTitle: "¿Qué quieres ahora?",
    onboardingStepSixSubtitle:
      "Empieza con cualquier cosa. Un tema, un plan o alguien que quieras conocer.",
    onboardingContinue: "Continuar",
    onboardingTryIt: "Probar",
    onboardingSkip: "Omitir por ahora",
    onboardingSearchOrAddTopic: "Busca o agrega un tema",
    onboardingPhotosTitle: "Fotos",
    onboardingPhotosPermissionBody:
      "Permite el acceso a tus fotos para agregar una imagen de perfil, o sáltalo por ahora.",
    onboardingProfilePhotoLabel: "Foto de perfil",
    onboardingProfilePhotoHint: "Abre tu biblioteca de fotos",
    onboardingAddPhoto: "Agregar foto",
    onboardingProfileNameLabel: "Nombre",
    onboardingProfileNamePlaceholder: "Tu nombre",
    onboardingProfileBioLabel: "Biografía corta (opcional)",
    onboardingProfileBioPlaceholder:
      "Me gusta el fútbol, el diseño y las caminatas nocturnas con café.",
    onboardingProfileBioHelper: "Opcional. Una línea corta alcanza.",
    onboardingProfileAreaLabel: "Ciudad o zona",
    onboardingProfileAreaPlaceholder: "ej. Palermo, Buenos Aires",
    onboardingProfileCountryLabel: "País o región",
    onboardingProfileCountryPlaceholder: "ej. Argentina",
    onboardingProfileCountryHelper:
      "Usaremos la región de tu dispositivo cuando podamos.",
    onboardingIntentPlaceholder: "Quiero hablar sobre el partido de anoche…",
    onboardingIntentExamples:
      "Ejemplos: encontrar gente para jugar hoy · conocer personas interesadas en diseño · salir a correr este fin de semana · hablar con otros founders",
    offlineNotice: "No tienes conexión. Reconéctate para sincronizar.",
    sendBlockedOffline: "No se puede enviar sin conexión.",
    agentComposerModeChat: "Chat",
    agentComposerModeIntent: "Planes e intenciones",
    agentHistoryLoading: "Cargando tu conversación…",
    agentWorkflowThinking: "Pensando…",
    agentWorkflowRouting: "Buscando la mejor ruta…",
    agentComposerHintChat:
      "Escribe aquí para respuestas y próximos pasos en este hilo.",
    agentComposerHintIntent:
      "Describe lo que quieres hacer y lo enviaremos a las personas correctas.",
    agentImageUrlOptional:
      "Enlace de imagen (opcional): adjunta una foto si ayuda.",
    homeTabHome: "Inicio",
    homeTabChats: "Chats",
    homeTabProfile: "Perfil",
    homeTabHomeHint: "Planes y chat",
    homeTabChatsHint: "Tus conversaciones",
    homeTabProfileHint: "Cuenta y ajustes",
    homeTabHomeDescription:
      "Planifica, conversa y sigue el progreso de lo que va pasando.",
    homeTabChatsDescription:
      "Hilos privados con personas con las que conectaste.",
    homeTabProfileDescription: "Preferencias, notificaciones y cuenta.",
    homeDrawerCloseMenu: "Cerrar menú",
    homeDrawerDismissMenu: "Cerrar menú",
    homeDrawerNewConversation: "Nueva conversación",
    homeDrawerNewConversationBody:
      "Limpia esta conversación y empieza de nuevo en este dispositivo.",
    homeDrawerNavigate: "Navegar",
    homeQueuedActions: "{count} acción{plural} en cola para sincronizar.",
    homeAgentSeedPrompt:
      "¿Qué te gustaría hacer hoy, o a quién te gustaría conocer?",
    homeThreadLoadFailedTitle: "No se pudo cargar tu conversación",
    homeThreadLoadFailedBody:
      "La conversación principal no se cargó correctamente. Inténtalo de nuevo.",
    homeThreadRetryCta: "Reintentar",
    homeThreadRecoveryKicker: "Social agéntico",
    homeThreadRecoveryTitle: "Reconectando tu hilo principal",
    homeThreadRecoveryBody:
      "Estoy restaurando tu conversación y la voy a traer de vuelta aquí apenas el hilo responda.",
    homeThreadRecoveryWaitingTitle:
      "Esperando para reconectar tu hilo principal",
    homeThreadRecoveryWaitingBody:
      "Mantengo esta conversación lista y reconectaré apenas el hilo vuelva a estar disponible.",
    homeThreadRetryingCountdown:
      "Reconectando tu hilo principal en {seconds}s · intento {attempt}",
    homeThreadRetryManualHint:
      "Si esto sigue pasando, reintenta cuando la conexión se estabilice.",
    openChatPresenceTitle: "Social agéntico",
    openChatPresenceSubtitle: "Listo cuando tú quieras.",
    openChatEmptyTitle: "¿Qué quieres hacer?",
    openChatEmptySubtitle:
      "Empieza con cualquier cosa. Un tema, un plan o alguien que quieras conocer.",
    homeWelcomeTitle: "Empieza con una intención.",
    homeWelcomeSubtitle:
      "Dile a OpenSocial qué quieres hacer, a quién quieres conocer o qué tipo de conversación quieres tener ahora.",
    homeWelcomeHowItWorksTitle: "Cómo funciona",
    homeWelcomeHowItWorksBody:
      "Escribes una vez. OpenSocial interpreta la señal, busca a las personas correctas y hace avanzar el hilo.",
    homeWelcomeExamplesTitle: "Qué decir",
    homeWelcomeExamplesBody:
      "Usa lenguaje natural. Un plan, un tema, una vibra o el tipo de persona que quieres conocer alcanza.",
    homeWelcomeChatsTitle: "Qué pasa después",
    homeWelcomeChatsBody:
      "Cuando alguien acepta, los chats se abren automáticamente. Te quedas en un solo hilo hasta que algo esté listo.",
    homeWelcomeTryTitle: "Prueba uno",
    homeWelcomeTryHint: "Usa esto como tu primer mensaje",
    homeWelcomePrimaryCta: "Probar ahora",
    homeWelcomeSkip: "Omitir",
    openChatOnboardingCarryoverTitle: "Traído desde onboarding",
    openChatOnboardingCarryoverProcessing:
      "Estamos llevando tu primer intent a tu hilo.",
    openChatOnboardingCarryoverReady:
      "Tu hilo empieza desde lo que ya dijiste.",
    openChatOnboardingCarryoverQueued:
      "Tu primer intent quedó guardado y se enviará cuando vuelvas a estar online.",
    openChatOnboardingCarryoverStartNow: "Empezar desde esto",
    openChatOnboardingCarryoverRetry: "Intentar enviar ahora",
    openChatOnboardingCarryoverProcessingInline: "Iniciando tu hilo…",
    openChatOnboardingHandoffTitle: "Iniciando tu hilo",
    openChatOnboardingHandoffSubtitle:
      "Estamos convirtiendo tu señal de onboarding en tu primera conversación.",
    openChatSuggestions: "Sugerencias",
    openChatActionOpenChats: "Abrir chats",
    openChatActionWiden: "Ampliar búsqueda",
    openChatActionOneToOne: "Mantener 1:1",
    openChatActionGroupsOk: "Grupos pequeños OK",
    openChatMoreOptions: "Más opciones",
    openChatHideOptions: "Ocultar opciones",
    openChatSplitIntent: "Dividir un mensaje amplio en varios intents",
    openChatOn: "ON",
    openChatOff: "OFF",
    openChatMaxIntents: "Máx. intents (1-5)",
    openChatComposerPlaceholder: "¿Qué quieres hacer o conversar?",
    openChatSendMessage: "Enviar mensaje",
    openChatInlineFootball: "Hablar de fútbol",
    openChatInlineFootballBody:
      "Quiero hablar de fútbol con gente que lo siga.",
    openChatInlineTonight: "Encontrar gente para hoy",
    openChatInlineTonightBody: "Encontrar gente que esté libre para salir hoy.",
    openChatInlineMeet: "Conocer a alguien nuevo",
    openChatInlineMeetBody:
      "Quiero conocer a alguien nuevo a través de un interés compartido.",
    openChatInlineGroup: "Crear un grupo",
    openChatInlineGroupBody:
      "Me interesa un grupo pequeño alrededor de algo que me importa.",
    openChatInlineExplore: "Explorar",
    openChatInlineExploreBody:
      "¿Qué está pasando que encaje con mis intereses?",
    chatsRealtimeLive: "Tiempo real: activo",
    chatsRealtimeConnecting: "Tiempo real: conectando",
    chatsRealtimeOffline: "Tiempo real: sin conexión (modo polling activo)",
    chatsDm: "DM",
    chatsGroup: "Grupo",
    chatsCreateGroupSandbox: "Crear sandbox grupal",
    chatsCreateChatSandbox: "Crear sandbox de chat",
    chatsSyncNow: "Sincronizar",
    chatsSyncingNow: "Sincronizando...",
    chatsEmptyTitle: "Todavía no hay chats",
    chatsEmptyDescription:
      "Crea un sandbox de chat para probar la persistencia de mensajes con la API real.",
    chatsUnread: "{count} sin leer",
    chatsReportUser: "Reportar usuario",
    chatsBlockUser: "Bloquear usuario",
    chatsNoMessages: "Todavía no hay mensajes en este hilo.",
    chatsSyncingLatest: "Sincronizando los últimos mensajes...",
    chatsSomeoneTyping: "Alguien está escribiendo...",
    chatsPeopleTyping: "{count} personas están escribiendo...",
    chatsMessagePlaceholder: "Mensaje…",
    chatsSendMessage: "Enviar mensaje de chat",
    profileInterests: "Intereses",
    profileDefaultSocialMode: "Modo social por defecto",
    profileModeGroup: "Grupo",
    profileModeFlexible: "Flexible",
    profileNotifications: "Notificaciones",
    profileLiveAlerts: "Alertas en vivo",
    profileDigestMode: "Modo resumen",
    profilePushStatus: "push: {status}",
    profileTokenStatus: "token: {status}",
    profileEnabled: "activado",
    profileDisabled: "desactivado",
    profileNotRegistered: "sin registrar",
    profileTrustSummary: "Resumen de confianza",
    profileDiscoverySnapshot: "Instantánea de descubrimiento",
    profileRefreshing: "Actualizando...",
    profileTonightReconnects: "hoy: {tonight} · reconexiones: {reconnects}",
    profileNoTonightSuggestions: "Todavía no hay sugerencias para hoy.",
    profilePublishToAgent: "Publicar en el hilo del agente",
    profileContinuityReconnect: "Continuidad y reconexión",
    profilePendingRequestSuggestions:
      "sugerencias de solicitudes pendientes: {count}",
    profileNoReconnectSuggestions: "Todavía no hay sugerencias de reconexión.",
    profileWhyThisRoutingResult: "Por qué salió este enrutamiento",
    profileLoadingExplanation: "Cargando explicación...",
    profileNoIntentsToExplain: "Todavía no hay intents activos para explicar.",
    profileSearchPlaceholder: "tenis, startups, diseño...",
    profileSearching: "Buscando...",
    profileSearchCounts:
      "usuarios {users} · temas {topics} · actividades {activities} · grupos {groups}",
    profileMemoryControls: "Controles de memoria",
    profileRefreshMemorySnapshot: "Actualizar estado de memoria",
    profileResetLearnedMemory: "Reiniciar memoria aprendida",
    profileMemoryLoaded:
      "grafo de vida cargado: {lifeGraph} · recuperación cargada: {retrieval}",
    profileYes: "sí",
    profileNo: "no",
    profileAutomations: "Automatizaciones",
    profileAutomationsBody: "Búsquedas guardadas y resúmenes programados.",
    profileNewSavedSearch: "Nueva búsqueda guardada",
    profileNewAutomation: "Nueva automatización",
    profileRunNow: "Ejecutar ahora",
    profileSavedSearchesTasks:
      "búsquedas guardadas: {searches} · tareas: {tasks}",
    profileNoRunsYet: "Todavía no hay ejecuciones.",
    profileRecurringCircles: "Círculos recurrentes",
    profileNew: "Nuevo",
    profileLoadingCircles: "Cargando círculos...",
    profileNoCircles:
      "Todavía no hay círculos. Crea uno para empezar sesiones recurrentes.",
    profileNextScheduled: "sin programar",
    profileSelectCircle: "Selecciona un círculo",
    profileOpenNow: "Abrir ahora",
    profileNoRecentSessions: "No hay sesiones recientes.",
    profileLocalTelemetry: "Telemetría local",
    profileEvents: "eventos: {count}",
    profileLast: "último: {value}",
    profileNa: "n/d",
    profileTelemetryIntents:
      "intents: {intents} · solicitudes enviadas: {sent} · respondidas: {responded}",
    profileTelemetryChats:
      "chats iniciados: {started} · primeros mensajes: {messages}",
    profileTelemetryModeration:
      "reportes: {reports} · usuarios bloqueados: {blocked}",
    profileTelemetryIntentMetrics:
      "intent→aceptación: {accept} · intent→primer mensaje: {firstMessage}",
    profileTelemetryConnectionMetrics:
      "éxito de conexión: {success} · cierre de grupo: {completion}",
    profileTelemetryNotificationMetrics:
      "notificación→apertura: {open} · incidencia de moderación: {incidence}",
    profileTelemetrySyncMetrics:
      "fallo de sync: {failure} · repetición: {repeat}",
    profileTelemetryActivationMetrics:
      "activación lista: {ready} · iniciada: {started} · éxito: {success} · en cola: {queued} · fallo: {failed} · promedio: {avg} · tasa éxito: {successRate}",
    profileActivationHealthNoData:
      "Salud de activación: reuniendo suficiente señal de primeras activaciones.",
    profileActivationHealthHealthy:
      "Salud de activación: sólida. La mayoría completa bien la primera activación.",
    profileActivationHealthWatch:
      "Salud de activación: observar. La cola o los reintentos están elevados.",
    profileActivationHealthCritical:
      "Salud de activación: crítica. Los fallos de primera activación están elevados.",
    profileSaveSettings: "Guardar ajustes",
    profileRequestDigestNow: "Pedir resumen ahora",
    profileSignOut: "Cerrar sesión",
    loadingYourSpace: "Cargando tu espacio…",
    authSessionExpired: "La sesión expiró. Inicia sesión de nuevo.",
    authSessionExpiredContinueOnboarding:
      "La sesión expiró. Inicia sesión de nuevo para continuar el onboarding.",
    authOfflineRestored:
      "No tienes conexión. Restauramos tu última sesión y sincronizaremos cuando vuelva internet.",
    onboardingMissingSession: "Falta una sesión autenticada.",
    onboardingSavedLocally:
      "Se guardó localmente. Terminaremos de sincronizar tu onboarding cuando vuelva internet.",
    onboardingPhotoUploadFailed: "La foto no se subió",
    onboardingBackdropKicker: "Onboarding agéntico",
  },
} as const;

export type TranslationKey = keyof (typeof catalogs)["en"];

export function t(
  key: TranslationKey,
  locale: AppLocale = "en",
  params?: Record<string, string | number>,
): string {
  let template = catalogs[locale][key] as string;
  if (!params) {
    return template;
  }
  for (const [paramKey, value] of Object.entries(params)) {
    template = template.replaceAll(`{${paramKey}}`, String(value));
  }
  return template;
}
