export const publicLocales = ["en", "es", "fr"] as const;
export type PublicLocale = (typeof publicLocales)[number];

export function isPublicLocale(
  value: string | undefined,
): value is PublicLocale {
  return value === "en" || value === "es" || value === "fr";
}

export const publicLocaleLabels: Record<PublicLocale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

export const publicLocaleControlLabels: Record<PublicLocale, string> = {
  en: "Language",
  es: "Idioma",
  fr: "Langue",
};

export function detectPublicLocale(
  acceptLanguage: string | null | undefined,
): PublicLocale {
  if (!acceptLanguage) {
    return "en";
  }

  const requested = acceptLanguage
    .split(",")
    .map((part) => {
      const [rawTag, rawWeight] = part.trim().split(";q=");
      const tag = rawTag?.toLowerCase();
      const weight = rawWeight ? Number.parseFloat(rawWeight) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0 };
    })
    .sort((left, right) => right.weight - left.weight);

  for (const { tag } of requested) {
    const language = tag?.split("-")[0];
    if (isPublicLocale(language)) {
      return language;
    }
  }

  return "en";
}

export function resolvePublicLocale({
  acceptLanguage,
  searchLocale,
  storedLocale,
}: {
  acceptLanguage?: string | null;
  searchLocale?: string;
  storedLocale?: string;
}): PublicLocale {
  if (isPublicLocale(searchLocale)) {
    return searchLocale;
  }

  if (isPublicLocale(storedLocale)) {
    return storedLocale;
  }

  return detectPublicLocale(acceptLanguage);
}

export const manifestoSections = {
  en: [
    {
      title: "Why We Exist",
      paragraphs: [
        "Social software moved away from helping people connect. It became better at keeping people watching than helping them meet, talk, plan, or do something together.",
        "OpenSocial exists to change that. We are building an intent-first social product where someone can say what they want to do, talk about, organize, or explore, and the system helps turn that intent into a real human connection.",
        "Our goal is simple to describe and hard to do well: reduce the distance between “I want this” and “I am doing this with someone.”",
      ],
    },
    {
      title: "What We Believe Social Should Be",
      paragraphs: [
        "We believe social products should begin with agency. A person should be able to express what they want in their own words, set their own boundaries, and stay in control of how connection happens.",
        "We do not believe the future of social is endless scrolling, passive browsing, or systems that keep people near each other without helping them actually meet.",
        "We believe the better model is intent, consent, and coordination. A user expresses a goal. The system understands it, finds relevant people, explains what is happening, and opens a connection only when the people involved choose it.",
      ],
    },
    {
      title: "The Human Boundary",
      paragraphs: [
        "AI is useful when its role is clear. In OpenSocial, AI can help understand intent, summarize progress, rank possible matches, identify risk, and coordinate the workflow around a social interaction.",
        "AI does not get to pretend to be the user. It does not quietly socialize on their behalf. It does not create false closeness, weaken consent, or replace a real conversation with something synthetic.",
        "That boundary is part of the product, not a marketing line. Once a connection is made, the conversation remains human. The model can help around the edges, but it should not replace the people the product is meant to bring together.",
      ],
    },
    {
      title: "How The Product Works",
      paragraphs: [
        "OpenSocial is built around a small set of clear ideas: intent, request, connection, chat, circle, notification, and agent-assisted workflow. That matters because it keeps the product focused on coordination, not generic social noise.",
        "A user writes what they want. The system interprets the request, finds potential matches, ranks candidates using trust, relevance, timing, and context, and sends explicit opt-in requests. Only after acceptance does a real connection open.",
        "This product is not feed first, not profile first, and not designed to trap the user in browsing. It is coordination first. It should feel fast, concrete, and easy to understand.",
      ],
    },
    {
      title: "What We Want To Achieve",
      paragraphs: [
        "We want to make it normal for software to help people move from desire to participation quickly. Talk about the match now. Find a tennis partner after seven. Meet builders in your city. Form a small poker group tonight. Reconnect with people who are a real fit.",
        "We want to support one-to-one conversations, same-day planning, group formation, passive availability, recurring circles, and relationship continuity over time. The goal is not more content. The goal is more meaningful contact.",
        "We also want to build the public contract for this model: a stable protocol and SDK that lets apps, services, and partner agents participate in an intent-first social network without guessing how the system works.",
      ],
    },
    {
      title: "Why The System Is Built This Way",
      paragraphs: [
        "We are deliberately building reliable infrastructure under the product. That means deterministic application-owned state transitions, append-only audit trails for critical changes, event-driven workflows, and clear operational boundaries.",
        "Our philosophy is straightforward. Agentic behavior can suggest, enrich, and prioritize, but the application owns final writes, policies, and guarantees. Reliable systems matter more than impressive demos.",
        "That is why the architecture starts as a modular monolith with internal event-driven workflows instead of a pile of disconnected services. It gives us faster iteration, easier debugging, and stronger transactional control while the product is still evolving.",
      ],
    },
    {
      title: "The Technologies Behind It",
      paragraphs: [
        "OpenSocial is built in TypeScript across the stack. The backend runs on NestJS with PostgreSQL as the source of truth, pgvector for semantic retrieval, Redis for queues, presence, cache, and rate limits, and BullMQ for durable workflow orchestration.",
        "Realtime behavior runs through WebSockets. Profile media flows through object storage and CDN delivery. Observability is built with OpenTelemetry so the product can be operated as a real system, not just shown as a polished prototype.",
        "On the intelligence layer, we use the OpenAI Responses API and the OpenAI Agents SDK where bounded multi-step orchestration makes sense. The important word is bounded. Planners suggest, tools gather, policies gate, the application decides, workers execute, and the database remains deterministic.",
      ],
    },
    {
      title: "Our Standard",
      paragraphs: [
        "A manifesto is only useful if it shapes the product. Ours does. We are committing to explicit consent, human-first interaction, operational clarity, and product surfaces that explain themselves quickly instead of asking people to learn a new social ritual.",
        "We are not building a generic social graph. We are not building an AI companion app. We are not building a feed with better branding. We are building an intent-driven coordination system for real people, real timing, and real relationships.",
        "This is the work. Build social software that helps people begin, not just watch. Build systems that are powerful without becoming deceptive. Build tools that create presence instead of performance.",
        "That is the direction. That is the product. That is OpenSocial.",
      ],
    },
  ],
  es: [
    {
      title: "Por qué existimos",
      paragraphs: [
        "El software social dejó de estar pensado para ayudar a las personas a encontrarse. Aprendió a mantenernos mirando, pero no necesariamente a ayudarnos a hablar, hacer planes o construir algo con otros.",
        "OpenSocial existe para cambiar eso. Estamos creando un producto social que empieza por la intención: una persona dice qué quiere hacer, conversar, organizar o explorar, y el sistema la ayuda a convertir esa intención en una conexión humana real.",
        "La meta es fácil de decir y difícil de hacer bien: acortar la distancia entre “quiero hacer esto” y “estoy haciendo esto con alguien”.",
      ],
    },
    {
      title: "Lo que creemos que debería ser lo social",
      paragraphs: [
        "Creemos que un producto social debe empezar por la agencia de cada persona. Cada usuario debería poder decir lo que quiere con sus propias palabras, marcar sus límites y mantener el control sobre cómo se da una conexión.",
        "No creemos que el futuro de lo social sea el scroll infinito, mirar sin participar o sistemas que nos mantienen cerca sin ayudarnos a encontrarnos de verdad.",
        "Creemos en un modelo basado en intención, consentimiento y coordinación. Una persona expresa un objetivo. El sistema lo entiende, encuentra personas relevantes, explica lo que está pasando y abre una conexión solo cuando las personas involucradas lo eligen.",
      ],
    },
    {
      title: "El límite humano",
      paragraphs: [
        "La IA es útil cuando su rol está claro. En OpenSocial puede ayudar a entender la intención, resumir avances, ordenar posibles conexiones, detectar riesgos y coordinar el flujo alrededor de una interacción social.",
        "La IA no debe hacerse pasar por el usuario. No debe socializar en silencio en su nombre. No debe crear una cercanía falsa, debilitar el consentimiento ni reemplazar una conversación real por algo sintético.",
        "Ese límite es parte del producto, no una frase de marketing. Cuando se abre una conexión, la conversación sigue siendo humana. El modelo puede ayudar alrededor, pero no reemplazar a las personas que el producto busca acercar.",
      ],
    },
    {
      title: "Cómo funciona el producto",
      paragraphs: [
        "OpenSocial se apoya en pocas ideas claras: intención, solicitud, conexión, chat, círculo, notificación y flujos asistidos por agentes. Eso importa porque mantiene el producto enfocado en coordinar, no en generar ruido social.",
        "Un usuario escribe lo que quiere. El sistema interpreta la solicitud, encuentra posibles coincidencias, ordena candidatos según confianza, relevancia, momento y contexto, y envía solicitudes con aceptación explícita. Solo después de aceptar se abre una conexión real.",
        "Este producto no empieza por el feed, ni por el perfil, ni está diseñado para dejar al usuario navegando sin rumbo. Empieza por la coordinación. Tiene que sentirse rápido, concreto y fácil de entender.",
      ],
    },
    {
      title: "Lo que queremos lograr",
      paragraphs: [
        "Queremos que sea normal que el software ayude a pasar de la intención a la acción. Hablar del partido ahora. Encontrar con quién jugar tenis después de las siete. Conocer personas que construyen en tu ciudad. Armar un grupo chico de póker esta noche. Reconectar con personas que realmente encajan.",
        "Queremos apoyar conversaciones uno a uno, planes para el mismo día, formación de grupos, disponibilidad pasiva, círculos recurrentes y continuidad en las relaciones. El objetivo no es más contenido. El objetivo es más contacto con sentido.",
        "También queremos construir el contrato público de este modelo: un protocolo estable y un SDK para que apps, servicios y agentes aliados puedan participar en una red social basada en intención sin tener que adivinar cómo funciona.",
      ],
    },
    {
      title: "Por qué lo construimos así",
      paragraphs: [
        "Estamos construyendo infraestructura confiable debajo del producto de manera deliberada. Eso significa transiciones de estado deterministas controladas por la aplicación, registros inmutables para cambios críticos, flujos guiados por eventos y límites operativos claros.",
        "Nuestra filosofía es simple. Los agentes pueden sugerir, enriquecer y priorizar, pero la aplicación conserva las escrituras finales, las políticas y las garantías. Los sistemas confiables importan más que las demos impresionantes.",
        "Por eso la arquitectura empieza como un monolito modular con flujos internos orientados a eventos, en vez de una colección de servicios desconectados. Nos da iteración más rápida, depuración más simple y mayor control transaccional mientras el producto evoluciona.",
      ],
    },
    {
      title: "La tecnología detrás",
      paragraphs: [
        "OpenSocial está construido en TypeScript en toda la pila tecnológica. El backend usa NestJS, PostgreSQL como fuente de verdad, pgvector para recuperación semántica, Redis para colas, presencia, caché y límites de uso, y BullMQ para orquestar flujos de forma duradera.",
        "El tiempo real corre sobre WebSockets. Los medios de perfil pasan por almacenamiento de objetos y CDN. La observabilidad está construida con OpenTelemetry para operar el producto como un sistema real, no solo mostrarlo como un prototipo pulido.",
        "En la capa de inteligencia usamos OpenAI Responses API y OpenAI Agents SDK cuando tiene sentido una orquestación acotada de varios pasos. La palabra clave es acotada. Los planners sugieren, las herramientas reúnen contexto, las políticas filtran, la aplicación decide, los workers ejecutan y la base de datos se mantiene determinista.",
      ],
    },
    {
      title: "Nuestro estándar",
      paragraphs: [
        "Un manifiesto solo sirve si le da forma al producto. El nuestro lo hace. Nos comprometemos con el consentimiento explícito, la interacción humana primero, la claridad operativa y superficies que se entienden rápido sin pedirle a la gente que aprenda un nuevo ritual social.",
        "No estamos construyendo un grafo social genérico. No estamos construyendo una app de compañía con IA. No estamos construyendo un feed con mejor branding. Estamos construyendo un sistema de coordinación basado en intención para personas reales, tiempos reales y relaciones reales.",
        "Ese es el trabajo. Construir software social que ayude a empezar, no solo a mirar. Construir sistemas poderosos sin volverlos engañosos. Construir herramientas que creen presencia en vez de pose.",
        "Esa es la dirección. Ese es el producto. Eso es OpenSocial.",
      ],
    },
  ],
  fr: [
    {
      title: "Pourquoi nous existons",
      paragraphs: [
        "Les logiciels sociaux se sont éloignés de leur promesse de départ: aider les personnes à se rencontrer. Ils savent très bien retenir l'attention, mais beaucoup moins aider les gens à parler, s'organiser ou faire quelque chose ensemble.",
        "OpenSocial existe pour changer cela. Nous construisons un produit social qui commence par l'intention: une personne dit ce qu'elle veut faire, comprendre, organiser ou explorer, et le système l'aide à transformer cette intention en vraie connexion humaine.",
        "Notre objectif est simple à formuler et difficile à réussir: réduire la distance entre “je veux faire cela” et “je suis en train de le faire avec quelqu'un”.",
      ],
    },
    {
      title: "Ce que le social devrait être",
      paragraphs: [
        "Nous pensons qu'un produit social doit commencer par l'agence de chaque personne. Chacun devrait pouvoir dire ce qu'il cherche avec ses propres mots, poser ses limites et garder le contrôle sur la manière dont une connexion se crée.",
        "Nous ne pensons pas que l'avenir du social soit le défilement infini, la navigation passive ou des systèmes qui gardent les gens proches sans les aider à vraiment se rencontrer.",
        "Nous croyons à un modèle fondé sur l'intention, le consentement et la coordination. Une personne exprime un objectif. Le système le comprend, trouve des personnes pertinentes, explique ce qui se passe et n'ouvre une connexion que lorsque les personnes concernées le choisissent.",
      ],
    },
    {
      title: "La limite humaine",
      paragraphs: [
        "L'IA est utile lorsque son rôle est clair. Dans OpenSocial, elle peut aider à comprendre l'intention, résumer l'avancement, classer des connexions possibles, repérer les risques et coordonner le parcours autour d'une interaction sociale.",
        "L'IA ne doit pas se faire passer pour l'utilisateur. Elle ne doit pas socialiser discrètement à sa place. Elle ne doit pas créer une fausse proximité, affaiblir le consentement ou remplacer une vraie conversation par quelque chose de synthétique.",
        "Cette limite fait partie du produit, pas d'une promesse marketing. Quand une connexion s'ouvre, la conversation reste humaine. Le modèle peut aider autour de l'échange, mais il ne doit pas remplacer les personnes que le produit cherche à rapprocher.",
      ],
    },
    {
      title: "Comment fonctionne le produit",
      paragraphs: [
        "OpenSocial repose sur quelques idées simples: intention, demande, connexion, chat, cercle, notification et parcours assistés par agents. C'est important, car cela garde le produit centré sur la coordination plutôt que sur le bruit social.",
        "Un utilisateur écrit ce qu'il veut. Le système interprète la demande, trouve des correspondances possibles, classe les candidats selon la confiance, la pertinence, le moment et le contexte, puis envoie des demandes avec acceptation explicite. Une vraie connexion ne s'ouvre qu'après accord.",
        "Ce produit ne commence pas par le feed, ni par le profil, et il n'est pas conçu pour enfermer l'utilisateur dans la navigation. Il commence par la coordination. Il doit être rapide, concret et facile à comprendre.",
      ],
    },
    {
      title: "Ce que nous voulons accomplir",
      paragraphs: [
        "Nous voulons qu'il devienne normal qu'un logiciel aide à passer de l'intention à l'action. Parler du match maintenant. Trouver un partenaire de tennis après dix-neuf heures. Rencontrer des personnes qui construisent dans sa ville. Monter un petit groupe de poker ce soir. Reprendre contact avec des personnes qui correspondent vraiment.",
        "Nous voulons soutenir les conversations en tête à tête, les plans du jour même, la formation de groupes, la disponibilité passive, les cercles récurrents et la continuité des relations dans le temps. L'objectif n'est pas plus de contenu. L'objectif est plus de contact qui compte.",
        "Nous voulons aussi construire le contrat public de ce modèle: un protocole stable et un SDK permettant aux apps, aux services et aux agents partenaires de participer à un réseau social fondé sur l'intention sans devoir deviner comment le système fonctionne.",
      ],
    },
    {
      title: "Pourquoi nous le construisons ainsi",
      paragraphs: [
        "Nous construisons volontairement une infrastructure fiable sous le produit. Cela signifie des transitions d'état déterministes contrôlées par l'application, des journaux immuables pour les changements critiques, des parcours guidés par événements et des limites opérationnelles claires.",
        "Notre philosophie est simple. Les agents peuvent suggérer, enrichir et prioriser, mais l'application garde les écritures finales, les politiques et les garanties. Les systèmes fiables comptent davantage que les démonstrations impressionnantes.",
        "C'est pourquoi l'architecture commence comme un monolithe modulaire avec des parcours internes orientés événements, plutôt qu'un empilement de services déconnectés. Cela nous donne une itération plus rapide, un débogage plus simple et un contrôle transactionnel plus fort pendant que le produit évolue.",
      ],
    },
    {
      title: "La technologie derrière le produit",
      paragraphs: [
        "OpenSocial est construit en TypeScript sur toute la pile technique. Le backend utilise NestJS, PostgreSQL comme source de vérité, pgvector pour la recherche sémantique, Redis pour les files, la présence, le cache et les limites d'usage, et BullMQ pour orchestrer les parcours de façon durable.",
        "Le temps réel passe par WebSockets. Les médias de profil passent par du stockage objet et un CDN. L'observabilité repose sur OpenTelemetry afin d'exploiter le produit comme un vrai système, pas seulement comme un prototype soigné.",
        "Sur la couche d'intelligence, nous utilisons OpenAI Responses API et OpenAI Agents SDK lorsqu'une orchestration bornée en plusieurs étapes est utile. Le mot clé est bornée. Les planners suggèrent, les outils rassemblent le contexte, les politiques filtrent, l'application décide, les workers exécutent et la base de données reste déterministe.",
      ],
    },
    {
      title: "Notre standard",
      paragraphs: [
        "Un manifeste n'a de valeur que s'il façonne le produit. Le nôtre le fait. Nous nous engageons pour le consentement explicite, l'interaction d'abord humaine, la clarté opérationnelle et des surfaces qui se comprennent vite sans demander aux gens d'apprendre un nouveau rituel social.",
        "Nous ne construisons pas un graphe social générique. Nous ne construisons pas une app de compagnon IA. Nous ne construisons pas un feed avec un meilleur branding. Nous construisons un système de coordination fondé sur l'intention pour des personnes réelles, des moments réels et des relations réelles.",
        "Voilà le travail. Construire un logiciel social qui aide à commencer, pas seulement à regarder. Construire des systèmes puissants sans les rendre trompeurs. Construire des outils qui créent de la présence plutôt que de la mise en scène.",
        "Voilà la direction. Voilà le produit. Voilà OpenSocial.",
      ],
    },
  ],
} as const;

export const publicCopy = {
  en: {
    localeLabel: "Language",
    manifesto: {
      title: "Manifesto",
      heroTitle: "We are building social software that starts with intent.",
      heroLede:
        "OpenSocial is an intent-first coordination system for real people. It helps someone express what they want, find the right people, and move toward genuine human connection with consent, clarity, safety, and speed.",
      joinWaitlist: "Join waitlist",
    },
    waitlist: {
      title: "Join waitlist",
      heroTitle: "Tell us you want a better way to meet the right people.",
      heroLede:
        "OpenSocial is building a human-first social product where intent, consent, and coordination come before feeds, noise, and passive browsing.",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      submit: "Join waitlist",
      submitting: "Joining...",
      emptyEmail: "Enter your email to join the waitlist.",
      success: "You are on the list. We will reach out when access opens.",
      retry: "Could not reach the server. Try again.",
      unknown: "Something went wrong.",
      faqTitle: "Questions",
      manifestoLink: "Manifesto",
      faqs: [
        {
          question: "What is OpenSocial?",
          answer:
            "OpenSocial is an intent-first social coordination product. Instead of browsing feeds or directories, people can say what they want to do or talk about, and the system helps them reach the right people.",
        },
        {
          question: "What does joining the waitlist do?",
          answer:
            "Joining the waitlist lets us contact you as access opens. It also helps us understand demand from the people who most want this kind of product.",
        },
        {
          question: "Who is this for?",
          answer:
            "It is for people with fragmented digital social lives who want faster ways to turn intent into real connection. That includes builders, creators, hobby groups, gamers, and people trying to meet around a clear shared purpose.",
        },
        {
          question: "Is this an AI companion app?",
          answer:
            "No. AI helps with understanding, ranking, safety, and coordination. It does not replace the people involved or speak as the user in real human conversations.",
        },
      ],
    },
  },
  es: {
    localeLabel: "Idioma",
    manifesto: {
      title: "Manifiesto",
      heroTitle:
        "Estamos construyendo software social que empieza por la intención.",
      heroLede:
        "OpenSocial es un sistema de coordinación basado en intención para personas reales. Ayuda a decir qué quieres, encontrar a las personas adecuadas y avanzar hacia una conexión humana con consentimiento, claridad, seguridad y velocidad.",
      joinWaitlist: "Unirme a la lista",
    },
    waitlist: {
      title: "Lista de espera",
      heroTitle:
        "Queremos saber si también buscas otra forma de conocer gente.",
      heroLede:
        "OpenSocial está creando un producto social donde la intención, el consentimiento y la coordinación van primero. Menos contenido pasivo, menos ruido, más conexiones reales.",
      emailLabel: "Email",
      emailPlaceholder: "tu@email.com",
      submit: "Unirme a la lista",
      submitting: "Enviando...",
      emptyEmail: "Escribe tu email para unirte a la lista.",
      success:
        "Listo, ya estás en la lista. Te vamos a escribir cuando abramos el acceso.",
      retry: "No pudimos conectar con el servidor. Intenta de nuevo.",
      unknown: "Algo salió mal.",
      faqTitle: "Preguntas",
      manifestoLink: "Manifiesto",
      faqs: [
        {
          question: "¿Qué es OpenSocial?",
          answer:
            "OpenSocial es un producto de coordinación social basado en intención. En vez de recorrer feeds o directorios, dices qué quieres hacer o conversar, y el sistema te ayuda a llegar a las personas adecuadas.",
        },
        {
          question: "¿Qué pasa cuando me uno a la lista?",
          answer:
            "Te podremos contactar cuando abramos el acceso. También nos ayuda a entender qué tipo de personas están buscando este producto desde el inicio.",
        },
        {
          question: "¿Para quién es?",
          answer:
            "Para personas que quieren convertir una intención en una conexión real más rápido: personas que construyen, creadores, grupos de hobbies, gamers y gente que quiere encontrarse alrededor de un propósito claro.",
        },
        {
          question: "¿Es una app de compañía con IA?",
          answer:
            "No. La IA ayuda a entender, ordenar, cuidar y coordinar. No reemplaza a las personas ni habla como si fuera el usuario en conversaciones humanas reales.",
        },
      ],
    },
  },
  fr: {
    localeLabel: "Langue",
    manifesto: {
      title: "Manifeste",
      heroTitle:
        "Nous construisons un logiciel social qui commence par l'intention.",
      heroLede:
        "OpenSocial est un système de coordination fondé sur l'intention pour de vraies personnes. Il aide chacun à dire ce qu'il cherche, à trouver les bonnes personnes et à avancer vers une connexion humaine avec consentement, clarté, sécurité et rapidité.",
      joinWaitlist: "Rejoindre la liste",
    },
    waitlist: {
      title: "Liste d'attente",
      heroTitle:
        "Dites-nous si vous cherchez une meilleure façon de rencontrer les bonnes personnes.",
      heroLede:
        "OpenSocial construit un produit social où l'intention, le consentement et la coordination passent avant les fils d'actualité, le bruit et la navigation passive.",
      emailLabel: "Email",
      emailPlaceholder: "vous@email.com",
      submit: "Rejoindre la liste",
      submitting: "Envoi...",
      emptyEmail: "Entrez votre email pour rejoindre la liste.",
      success:
        "C'est fait, vous êtes sur la liste. Nous vous écrirons lorsque l'accès ouvrira.",
      retry: "Impossible de joindre le serveur. Réessayez.",
      unknown: "Une erreur est survenue.",
      faqTitle: "Questions",
      manifestoLink: "Manifeste",
      faqs: [
        {
          question: "Qu'est-ce qu'OpenSocial ?",
          answer:
            "OpenSocial est un produit de coordination sociale fondé sur l'intention. Au lieu de parcourir des fils d'actualité ou des annuaires, vous dites ce que vous voulez faire ou discuter, et le système vous aide à atteindre les bonnes personnes.",
        },
        {
          question: "Que se passe-t-il quand je rejoins la liste ?",
          answer:
            "Nous pourrons vous contacter lorsque l'accès ouvrira. Cela nous aide aussi à comprendre quelles personnes cherchent ce produit dès le départ.",
        },
        {
          question: "À qui cela s'adresse-t-il ?",
          answer:
            "Aux personnes qui veulent transformer plus vite une intention en vraie connexion: personnes qui construisent, créateurs, groupes de loisirs, joueurs et personnes qui veulent se rencontrer autour d'un objectif clair.",
        },
        {
          question: "Est-ce une app de compagnon IA ?",
          answer:
            "Non. L'IA aide à comprendre, classer, sécuriser et coordonner. Elle ne remplace pas les personnes et ne parle pas comme si elle était l'utilisateur dans de vraies conversations humaines.",
        },
      ],
    },
  },
} as const;
