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
      title: "Por Qué Existimos",
      paragraphs: [
        "El software social se alejó de ayudar a las personas a conectarse. Se volvió mejor para mantenerlas mirando que para ayudarlas a conocerse, hablar, planear o hacer algo juntas.",
        "OpenSocial existe para cambiar eso. Estamos construyendo un producto social centrado en la intención, donde alguien puede decir qué quiere hacer, hablar, organizar o explorar, y el sistema ayuda a convertir esa intención en una conexión humana real.",
        "Nuestro objetivo es simple de describir y difícil de hacer bien: reducir la distancia entre “quiero esto” y “estoy haciendo esto con alguien”.",
      ],
    },
    {
      title: "Lo Que Creemos Que Debe Ser Lo Social",
      paragraphs: [
        "Creemos que los productos sociales deben empezar con la agencia de la persona. Cada usuario debería poder expresar lo que quiere con sus propias palabras, definir sus límites y mantener el control de cómo ocurre la conexión.",
        "No creemos que el futuro de lo social sea el scroll infinito, la navegación pasiva o los sistemas que mantienen a la gente cerca sin ayudarla a encontrarse de verdad.",
        "Creemos que el mejor modelo es intención, consentimiento y coordinación. Un usuario expresa un objetivo. El sistema lo entiende, encuentra personas relevantes, explica lo que está ocurriendo y abre una conexión solo cuando las personas involucradas lo eligen.",
      ],
    },
    {
      title: "El Límite Humano",
      paragraphs: [
        "La IA es útil cuando su papel es claro. En OpenSocial, la IA puede ayudar a entender la intención, resumir el progreso, priorizar posibles coincidencias, identificar riesgo y coordinar el flujo alrededor de una interacción social.",
        "La IA no debe fingir ser el usuario. No debe socializar en su nombre sin avisar. No debe crear una falsa cercanía, debilitar el consentimiento ni reemplazar una conversación real por algo sintético.",
        "Ese límite es parte del producto, no una frase de marketing. Una vez que se crea la conexión, la conversación sigue siendo humana. El modelo puede ayudar en los bordes, pero no debe reemplazar a las personas que el producto busca reunir.",
      ],
    },
    {
      title: "Cómo Funciona El Producto",
      paragraphs: [
        "OpenSocial está construido sobre un pequeño conjunto de ideas claras: intención, solicitud, conexión, chat, círculo, notificación y flujo asistido por agentes. Eso importa porque mantiene el producto enfocado en coordinar, no en generar ruido social genérico.",
        "Un usuario escribe lo que quiere. El sistema interpreta la solicitud, encuentra posibles coincidencias, prioriza candidatos según confianza, relevancia, momento y contexto, y envía solicitudes con aceptación explícita. Solo después de aceptar se abre una conexión real.",
        "Este producto no está diseñado alrededor del feed, ni del perfil, ni para atrapar al usuario navegando. Está diseñado alrededor de la coordinación. Debe sentirse rápido, concreto y fácil de entender.",
      ],
    },
    {
      title: "Lo Que Queremos Lograr",
      paragraphs: [
        "Queremos que sea normal que el software ayude a las personas a pasar del deseo a la participación rápidamente. Hablar del partido ahora. Encontrar una pareja para tenis después de las siete. Conocer builders en tu ciudad. Formar un pequeño grupo de póker esta noche. Reconectarse con personas realmente compatibles.",
        "Queremos apoyar conversaciones uno a uno, planes para el mismo día, formación de grupos, disponibilidad pasiva, círculos recurrentes y continuidad de la relación con el tiempo. El objetivo no es más contenido. El objetivo es más contacto significativo.",
        "También queremos construir el contrato público para este modelo: un protocolo estable y un SDK que permitan a apps, servicios y agentes asociados participar en una red social centrada en la intención sin adivinar cómo funciona el sistema.",
      ],
    },
    {
      title: "Por Qué El Sistema Está Construido Así",
      paragraphs: [
        "Estamos construyendo infraestructura confiable debajo del producto de forma deliberada. Eso significa transiciones de estado deterministas controladas por la aplicación, auditorías append-only para cambios críticos, flujos dirigidos por eventos y límites operativos claros.",
        "Nuestra filosofía es sencilla. El comportamiento agéntico puede sugerir, enriquecer y priorizar, pero la aplicación conserva las escrituras finales, las políticas y las garantías. Los sistemas confiables importan más que las demos impresionantes.",
        "Por eso la arquitectura empieza como un monolito modular con flujos internos orientados a eventos, en lugar de un conjunto de servicios desconectados. Nos da iteración más rápida, depuración más simple y mejor control transaccional mientras el producto sigue evolucionando.",
      ],
    },
    {
      title: "Las Tecnologías Detrás",
      paragraphs: [
        "OpenSocial está construido en TypeScript en toda la pila. El backend corre sobre NestJS con PostgreSQL como fuente de verdad, pgvector para recuperación semántica, Redis para colas, presencia, caché y límites, y BullMQ para orquestación durable de flujos.",
        "El comportamiento en tiempo real corre sobre WebSockets. Los medios de perfil fluyen por almacenamiento de objetos y entrega por CDN. La observabilidad está construida con OpenTelemetry para que el producto pueda operarse como un sistema real, no solo mostrarse como un prototipo pulido.",
        "En la capa de inteligencia usamos la OpenAI Responses API y el OpenAI Agents SDK cuando la orquestación acotada de varios pasos tiene sentido. La palabra importante es acotada. Los planners sugieren, las herramientas reúnen, las políticas filtran, la aplicación decide, los workers ejecutan y la base de datos se mantiene determinista.",
      ],
    },
    {
      title: "Nuestro Estándar",
      paragraphs: [
        "Un manifiesto solo es útil si da forma al producto. El nuestro lo hace. Nos comprometemos con el consentimiento explícito, la interacción humana primero, la claridad operativa y superficies de producto que se explican rápido en lugar de pedirle a la gente que aprenda un nuevo ritual social.",
        "No estamos construyendo un grafo social genérico. No estamos construyendo una app de compañero de IA. No estamos construyendo un feed con mejor branding. Estamos construyendo un sistema de coordinación centrado en la intención para personas reales, tiempos reales y relaciones reales.",
        "Este es el trabajo. Construir software social que ayude a las personas a empezar, no solo a mirar. Construir sistemas poderosos sin que se vuelvan engañosos. Construir herramientas que creen presencia en lugar de performance.",
        "Esa es la dirección. Ese es el producto. Eso es OpenSocial.",
      ],
    },
  ],
  fr: [
    {
      title: "Pourquoi Nous Existons",
      paragraphs: [
        "Les logiciels sociaux se sont éloignés de leur rôle initial qui consistait à aider les gens à se connecter. Ils sont devenus meilleurs pour retenir l'attention que pour aider les personnes à se rencontrer, parler, organiser ou faire quelque chose ensemble.",
        "OpenSocial existe pour changer cela. Nous construisons un produit social centré sur l'intention, où une personne peut dire ce qu'elle veut faire, discuter, organiser ou explorer, et où le système aide à transformer cette intention en une vraie connexion humaine.",
        "Notre objectif est simple à décrire et difficile à bien réaliser : réduire la distance entre « je veux cela » et « je suis en train de faire cela avec quelqu'un ».",
      ],
    },
    {
      title: "Ce Que Nous Pensons Que Le Social Doit Être",
      paragraphs: [
        "Nous pensons que les produits sociaux doivent commencer par l'autonomie de la personne. Chacun devrait pouvoir exprimer ce qu'il veut avec ses propres mots, définir ses limites et garder le contrôle sur la manière dont la connexion se fait.",
        "Nous ne pensons pas que l'avenir du social soit le défilement infini, la navigation passive ou des systèmes qui gardent les gens proches les uns des autres sans les aider à vraiment se rencontrer.",
        "Nous pensons que le meilleur modèle est l'intention, le consentement et la coordination. Un utilisateur exprime un objectif. Le système le comprend, trouve des personnes pertinentes, explique ce qui se passe et n'ouvre une connexion que lorsque les personnes concernées le choisissent.",
      ],
    },
    {
      title: "La Frontière Humaine",
      paragraphs: [
        "L'IA est utile lorsque son rôle est clair. Dans OpenSocial, l'IA peut aider à comprendre l'intention, résumer l'avancement, classer des correspondances possibles, identifier les risques et coordonner le flux autour d'une interaction sociale.",
        "L'IA ne doit pas prétendre être l'utilisateur. Elle ne doit pas socialiser discrètement à sa place. Elle ne doit pas créer une fausse proximité, affaiblir le consentement ou remplacer une vraie conversation par quelque chose de synthétique.",
        "Cette frontière fait partie du produit, pas d'un slogan marketing. Une fois la connexion créée, la conversation reste humaine. Le modèle peut aider autour, mais il ne doit pas remplacer les personnes que le produit cherche à réunir.",
      ],
    },
    {
      title: "Comment Le Produit Fonctionne",
      paragraphs: [
        "OpenSocial repose sur un petit ensemble d'idées claires : intention, demande, connexion, chat, cercle, notification et workflow assisté par agent. C'est important, car cela garde le produit centré sur la coordination plutôt que sur le bruit social générique.",
        "Un utilisateur écrit ce qu'il veut. Le système interprète la demande, trouve des correspondances potentielles, classe les candidats selon la confiance, la pertinence, le moment et le contexte, puis envoie des demandes avec accord explicite. Ce n'est qu'après acceptation qu'une vraie connexion s'ouvre.",
        "Ce produit n'est pas centré sur le feed, ni sur le profil, ni conçu pour piéger l'utilisateur dans la navigation. Il est centré sur la coordination. Il doit sembler rapide, concret et facile à comprendre.",
      ],
    },
    {
      title: "Ce Que Nous Voulons Accomplir",
      paragraphs: [
        "Nous voulons rendre normal le fait que le logiciel aide les personnes à passer rapidement du désir à la participation. Parler du match maintenant. Trouver un partenaire de tennis après dix-neuf heures. Rencontrer des builders dans sa ville. Former un petit groupe de poker ce soir. Reprendre contact avec des personnes vraiment compatibles.",
        "Nous voulons soutenir les conversations en tête à tête, les plans le jour même, la formation de groupes, la disponibilité passive, les cercles récurrents et la continuité des relations dans le temps. L'objectif n'est pas plus de contenu. L'objectif est plus de contact significatif.",
        "Nous voulons aussi construire le contrat public de ce modèle : un protocole stable et un SDK permettant aux applications, aux services et aux agents partenaires de participer à un réseau social centré sur l'intention sans devoir deviner comment le système fonctionne.",
      ],
    },
    {
      title: "Pourquoi Le Système Est Construit Ainsi",
      paragraphs: [
        "Nous construisons volontairement une infrastructure fiable sous le produit. Cela signifie des transitions d'état déterministes contrôlées par l'application, des journaux append-only pour les changements critiques, des workflows pilotés par événements et des frontières opérationnelles claires.",
        "Notre philosophie est simple. Le comportement agentique peut suggérer, enrichir et prioriser, mais l'application garde les écritures finales, les politiques et les garanties. Les systèmes fiables comptent davantage que les démonstrations impressionnantes.",
        "C'est pourquoi l'architecture commence comme un monolithe modulaire avec des workflows internes orientés événements, plutôt qu'un empilement de services déconnectés. Cela nous donne plus de vitesse d'itération, plus de facilité de débogage et un meilleur contrôle transactionnel pendant que le produit évolue encore.",
      ],
    },
    {
      title: "Les Technologies Derrière",
      paragraphs: [
        "OpenSocial est construit en TypeScript sur toute la pile. Le backend fonctionne avec NestJS, PostgreSQL comme source de vérité, pgvector pour la recherche sémantique, Redis pour les files, la présence, le cache et les limites, et BullMQ pour une orchestration durable des workflows.",
        "Le comportement temps réel repose sur WebSockets. Les médias de profil passent par le stockage d'objets et la diffusion CDN. L'observabilité est construite avec OpenTelemetry afin que le produit puisse être exploité comme un vrai système, et pas seulement montré comme un prototype soigné.",
        "Sur la couche d'intelligence, nous utilisons l'OpenAI Responses API et le SDK OpenAI Agents lorsque l'orchestration bornée en plusieurs étapes a du sens. Le mot important est bornée. Les planners suggèrent, les outils collectent, les politiques filtrent, l'application décide, les workers exécutent et la base de données reste déterministe.",
      ],
    },
    {
      title: "Notre Standard",
      paragraphs: [
        "Un manifeste n'est utile que s'il façonne le produit. Le nôtre le fait. Nous nous engageons à respecter le consentement explicite, l'interaction centrée sur l'humain, la clarté opérationnelle et des interfaces qui s'expliquent rapidement au lieu d'imposer un nouveau rituel social.",
        "Nous ne construisons pas un graphe social générique. Nous ne construisons pas une application de compagnon IA. Nous ne construisons pas un feed avec un meilleur branding. Nous construisons un système de coordination centré sur l'intention pour des personnes réelles, des moments réels et des relations réelles.",
        "Voilà le travail. Construire un logiciel social qui aide les gens à commencer, pas seulement à regarder. Construire des systèmes puissants sans qu'ils deviennent trompeurs. Construire des outils qui créent de la présence au lieu de la performance.",
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
            "Joining the waitlist lets us contact you as access opens up. It also helps us understand demand from the people who most want this kind of product.",
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
        "Estamos construyendo software social que empieza con la intención.",
      heroLede:
        "OpenSocial es un sistema de coordinación centrado en la intención para personas reales. Ayuda a expresar lo que alguien quiere, encontrar a las personas correctas y avanzar hacia una conexión humana genuina con consentimiento, claridad, seguridad y rapidez.",
      joinWaitlist: "Unirse a la lista",
    },
    waitlist: {
      title: "Unirse a la lista",
      heroTitle:
        "Cuéntanos que quieres una mejor manera de encontrar a las personas correctas.",
      heroLede:
        "OpenSocial está construyendo un producto social humano primero, donde la intención, el consentimiento y la coordinación van antes que los feeds, el ruido y la navegación pasiva.",
      emailLabel: "Correo",
      emailPlaceholder: "tu@ejemplo.com",
      submit: "Unirse a la lista",
      submitting: "Uniéndose...",
      emptyEmail: "Ingresa tu correo para unirte a la lista.",
      success:
        "Ya estás en la lista. Te escribiremos cuando se abra el acceso.",
      retry: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
      unknown: "Algo salió mal.",
      faqTitle: "Preguntas",
      manifestoLink: "Manifiesto",
      faqs: [
        {
          question: "¿Qué es OpenSocial?",
          answer:
            "OpenSocial es un producto de coordinación social centrado en la intención. En lugar de recorrer feeds o directorios, las personas pueden decir qué quieren hacer o conversar, y el sistema las ayuda a llegar a las personas correctas.",
        },
        {
          question: "¿Qué significa unirse a la lista?",
          answer:
            "Unirse a la lista nos permite contactarte cuando se abra el acceso. También nos ayuda a entender la demanda de las personas que más quieren este tipo de producto.",
        },
        {
          question: "¿Para quién es esto?",
          answer:
            "Es para personas con vidas sociales digitales fragmentadas que quieren convertir una intención en una conexión real más rápido. Eso incluye builders, creadores, grupos de hobby, gamers y personas que quieren encontrarse alrededor de un propósito claro.",
        },
        {
          question: "¿Es una app de compañero de IA?",
          answer:
            "No. La IA ayuda con comprensión, priorización, seguridad y coordinación. No reemplaza a las personas involucradas ni habla como el usuario en conversaciones humanas reales.",
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
        "OpenSocial est un système de coordination centré sur l'intention pour de vraies personnes. Il aide chacun à exprimer ce qu'il veut, à trouver les bonnes personnes et à avancer vers une vraie connexion humaine avec consentement, clarté, sécurité et rapidité.",
      joinWaitlist: "Rejoindre la liste",
    },
    waitlist: {
      title: "Rejoindre la liste",
      heroTitle:
        "Dites-nous que vous voulez une meilleure façon de rencontrer les bonnes personnes.",
      heroLede:
        "OpenSocial construit un produit social centré sur l'humain, où l'intention, le consentement et la coordination passent avant les feeds, le bruit et la navigation passive.",
      emailLabel: "E-mail",
      emailPlaceholder: "vous@exemple.com",
      submit: "Rejoindre la liste",
      submitting: "Inscription...",
      emptyEmail: "Entrez votre e-mail pour rejoindre la liste.",
      success:
        "Vous êtes sur la liste. Nous vous contacterons lorsque l'accès ouvrira.",
      retry: "Impossible de joindre le serveur. Réessayez.",
      unknown: "Une erreur est survenue.",
      faqTitle: "Questions",
      manifestoLink: "Manifeste",
      faqs: [
        {
          question: "Qu'est-ce qu'OpenSocial ?",
          answer:
            "OpenSocial est un produit de coordination sociale centré sur l'intention. Au lieu de parcourir des feeds ou des annuaires, les personnes peuvent dire ce qu'elles veulent faire ou discuter, et le système les aide à atteindre les bonnes personnes.",
        },
        {
          question: "Que signifie rejoindre la liste d'attente ?",
          answer:
            "Rejoindre la liste nous permet de vous contacter lorsque l'accès s'ouvrira. Cela nous aide aussi à comprendre la demande des personnes qui veulent vraiment ce type de produit.",
        },
        {
          question: "À qui cela s'adresse-t-il ?",
          answer:
            "Cela s'adresse aux personnes dont la vie sociale numérique est fragmentée et qui veulent transformer plus vite une intention en vraie connexion. Cela inclut des builders, des créateurs, des groupes de loisirs, des joueurs et des personnes qui veulent se rencontrer autour d'un objectif clair.",
        },
        {
          question: "Est-ce une application de compagnon IA ?",
          answer:
            "Non. L'IA aide à comprendre, classer, sécuriser et coordonner. Elle ne remplace pas les personnes concernées et ne parle pas à la place de l'utilisateur dans de vraies conversations humaines.",
        },
      ],
    },
  },
} as const;
