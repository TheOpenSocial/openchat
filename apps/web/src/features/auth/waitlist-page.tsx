"use client";

import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

import { api, isRetryableApiError } from "@/src/lib/api";
import styles from "./waitlist-page.module.css";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const waitlistLocales = ["en", "es", "fr"] as const;

export type WaitlistLocale = (typeof waitlistLocales)[number];

export function isWaitlistLocale(
  value: string | undefined,
): value is WaitlistLocale {
  return value === "en" || value === "es" || value === "fr";
}

type WaitlistStatus = "idle" | "submitting" | "success" | "error";
type Theme = "light" | "dark";

const localeLabels: Record<WaitlistLocale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

const copy: Record<
  WaitlistLocale,
  {
    title: string;
    heroTitle: string;
    heroLede: string;
    emailLabel: string;
    emailPlaceholder: string;
    submit: string;
    submitting: string;
    emptyEmail: string;
    success: string;
    retry: string;
    unknown: string;
    manifestoLink: string;
    faqsTitle: string;
    faqs: Array<{ question: string; answer: string }>;
    themeToggleLabel: (theme: Theme) => string;
  }
> = {
  en: {
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
    manifestoLink: "Manifesto",
    faqsTitle: "Questions",
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
          "It is for people with fragmented digital social lives who want faster ways to turn intent into real connection.",
      },
      {
        question: "Is this an AI companion app?",
        answer:
          "No. AI helps with understanding, ranking, safety, and coordination. It does not replace the people involved.",
      },
    ],
    themeToggleLabel: (theme) =>
      `Switch to ${theme === "light" ? "dark" : "light"} mode`,
  },
  es: {
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
    success: "Ya estás en la lista. Te escribiremos cuando se abra el acceso.",
    retry: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
    unknown: "Algo salió mal.",
    manifestoLink: "Manifiesto",
    faqsTitle: "Preguntas",
    faqs: [
      {
        question: "¿Qué es OpenSocial?",
        answer:
          "OpenSocial es un producto de coordinación social centrado en la intención.",
      },
      {
        question: "¿Qué significa unirse a la lista?",
        answer:
          "Unirse a la lista nos permite contactarte cuando se abra el acceso.",
      },
      {
        question: "¿Para quién es esto?",
        answer:
          "Es para personas con vidas sociales digitales fragmentadas que quieren convertir una intención en una conexión real más rápido.",
      },
      {
        question: "¿Es una app de compañero de IA?",
        answer:
          "No. La IA ayuda con comprensión, priorización, seguridad y coordinación. No reemplaza a las personas.",
      },
    ],
    themeToggleLabel: (theme) =>
      `Cambiar a modo ${theme === "light" ? "oscuro" : "claro"}`,
  },
  fr: {
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
    manifestoLink: "Manifeste",
    faqsTitle: "Questions",
    faqs: [
      {
        question: "Qu'est-ce qu'OpenSocial ?",
        answer:
          "OpenSocial est un produit de coordination sociale centré sur l'intention.",
      },
      {
        question: "Que signifie rejoindre la liste d'attente ?",
        answer:
          "Rejoindre la liste nous permet de vous contacter lorsque l'accès s'ouvrira.",
      },
      {
        question: "À qui cela s'adresse-t-il ?",
        answer:
          "Cela s'adresse aux personnes qui veulent transformer plus vite une intention en vraie connexion.",
      },
      {
        question: "Est-ce une application de compagnon IA ?",
        answer:
          "Non. L'IA aide à comprendre, classer, sécuriser et coordonner. Elle ne remplace pas les personnes.",
      },
    ],
    themeToggleLabel: (theme) =>
      `Passer en mode ${theme === "light" ? "sombre" : "clair"}`,
  },
};

export function WaitlistPage({
  initialLocale = "en",
  initialTheme = "dark",
}: {
  initialLocale?: WaitlistLocale;
  initialTheme?: Theme;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [locale, setLocale] = useState<WaitlistLocale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [openItem, setOpenItem] = useState<number>(0);
  const messageId = "waitlist-form-message";
  const localeCopy = copy[locale];

  const setCookie = (name: string, value: string) => {
    document.cookie = `${name}=${value};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.currentTarget.value);
    if (status !== "idle") {
      setStatus("idle");
      setMessage(null);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      setStatus("error");
      setMessage(localeCopy.emptyEmail);
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      await api.joinWaitlist(trimmed, "web-waitlist-page");
      setEmail("");
      setStatus("success");
      setMessage(localeCopy.success);
    } catch (error) {
      setStatus("error");
      setMessage(
        isRetryableApiError(error)
          ? localeCopy.retry
          : error instanceof Error
            ? error.message
            : localeCopy.unknown,
      );
    }
  };

  const onLocaleChange = (nextLocale: WaitlistLocale) => {
    setLocale(nextLocale);
    setCookie("opensocial-public-locale", nextLocale);
    window.localStorage.setItem("opensocial.web.locale", nextLocale);
  };

  const onThemeToggle = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    setCookie("opensocial-public-theme", nextTheme);
    window.localStorage.setItem("opensocial-public-theme", nextTheme);
  };

  return (
    <main className={styles.page} data-theme={theme} lang={locale}>
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link className={styles.brand} href="/">
            <svg
              viewBox="0 0 1024 1024"
              aria-hidden="true"
              className={styles.brandMark}
            >
              <path
                d="M512 309A228 228 0 0 0 512 755A228 228 0 0 0 512 309Z"
                fill="currentColor"
              />
              <circle
                cx="407"
                cy="532"
                r="228"
                fill="none"
                stroke="currentColor"
                strokeWidth="42"
              />
              <circle
                cx="617"
                cy="532"
                r="228"
                fill="none"
                stroke="currentColor"
                strokeWidth="42"
              />
            </svg>
            <span>OpenSocial</span>
          </Link>

          <div className={styles.navActions}>
            <div
              aria-label="Language"
              className={styles.localeSwitcher}
              role="group"
            >
              {waitlistLocales.map((option) => (
                <button
                  aria-pressed={locale === option}
                  className={`${styles.localeOption} ${
                    locale === option ? styles.localeOptionActive : ""
                  }`}
                  key={option}
                  onClick={() => onLocaleChange(option)}
                  type="button"
                >
                  {localeLabels[option]}
                </button>
              ))}
            </div>
            <button
              aria-label={localeCopy.themeToggleLabel(theme)}
              className={styles.themeToggle}
              onClick={onThemeToggle}
              type="button"
            >
              {theme === "light" ? "Moon" : "Sun"}
            </button>
            <Link className={styles.navLink} href="/manifesto">
              {localeCopy.manifestoLink}
            </Link>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.hero}>
            <p className={styles.kicker}>{localeCopy.title}</p>
            <h1 className={styles.title}>{localeCopy.heroTitle}</h1>
            <p className={styles.lede}>{localeCopy.heroLede}</p>
          </section>

          <section className={styles.panel}>
            <form className={styles.form} noValidate onSubmit={onSubmit}>
              <label className={styles.label} htmlFor="waitlist-email">
                {localeCopy.emailLabel}
              </label>
              <input
                aria-describedby={message ? messageId : undefined}
                aria-invalid={status === "error"}
                className={styles.input}
                id="waitlist-email"
                onChange={onChange}
                placeholder={localeCopy.emailPlaceholder}
                type="email"
                value={email}
              />
              <button
                className={styles.submit}
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting"
                  ? localeCopy.submitting
                  : localeCopy.submit}
              </button>
              {message ? (
                <p
                  className={`${styles.message} ${
                    status === "success"
                      ? styles.messageSuccess
                      : styles.messageError
                  }`}
                  id={messageId}
                  role={status === "error" ? "alert" : "status"}
                >
                  {message}
                </p>
              ) : null}
            </form>
          </section>
        </div>

        <section className={styles.faq}>
          <p className={styles.kicker}>{localeCopy.faqsTitle}</p>
          <div className={styles.accordion}>
            {localeCopy.faqs.map((item, index) => {
              const open = openItem === index;
              return (
                <section className={styles.accordionItem} key={item.question}>
                  <button
                    aria-expanded={open}
                    className={styles.accordionTrigger}
                    onClick={() => setOpenItem(open ? -1 : index)}
                    type="button"
                  >
                    <span>{item.question}</span>
                    <span aria-hidden="true">{open ? "x" : "+"}</span>
                  </button>
                  {open ? (
                    <div className={styles.accordionContent}>
                      <p>{item.answer}</p>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
