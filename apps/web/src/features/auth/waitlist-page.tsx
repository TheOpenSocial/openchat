"use client";

import Link from "next/link";
import { Moon, Plus, SunMedium, X } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { api, isRetryableApiError } from "@/src/lib/api";
import { publicCopy, type PublicLocale } from "./public-locale";
import { PublicLocaleSwitcher } from "./public-locale-switcher";
import styles from "./waitlist-page.module.css";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type WaitlistStatus = "idle" | "submitting" | "success" | "error";
type Theme = "light" | "dark";

const themeToggleLabel: Record<PublicLocale, Record<Theme, string>> = {
  en: {
    light: "Switch to dark mode",
    dark: "Switch to light mode",
  },
  es: {
    light: "Cambiar a modo oscuro",
    dark: "Cambiar a modo claro",
  },
  fr: {
    light: "Passer en mode sombre",
    dark: "Passer en mode clair",
  },
};

export function WaitlistPage({
  initialLocale = "en",
  initialTheme = "dark",
}: {
  initialLocale?: PublicLocale;
  initialTheme?: Theme;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [locale, setLocale] = useState<PublicLocale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [openItem, setOpenItem] = useState<number>(0);
  const messageId = "waitlist-form-message";
  const localeCopy = publicCopy[locale].waitlist;

  const setCookie = (name: string, value: string) => {
    document.cookie = `${name}=${value};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  };

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

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
            <PublicLocaleSwitcher locale={locale} />
            <button
              aria-label={themeToggleLabel[locale][theme]}
              aria-pressed={theme === "dark"}
              className={styles.themeToggle}
              onClick={onThemeToggle}
              type="button"
            >
              {theme === "light" ? (
                <Moon aria-hidden="true" size={17} strokeWidth={2} />
              ) : (
                <SunMedium aria-hidden="true" size={17} strokeWidth={2} />
              )}
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
            <form
              aria-busy={status === "submitting"}
              className={styles.form}
              noValidate
              onSubmit={onSubmit}
            >
              <label className={styles.label} htmlFor="waitlist-email">
                {localeCopy.emailLabel}
              </label>
              <input
                aria-describedby={messageId}
                aria-invalid={status === "error"}
                autoComplete="email"
                className={styles.input}
                id="waitlist-email"
                inputMode="email"
                name="email"
                onChange={onChange}
                placeholder={localeCopy.emailPlaceholder}
                required
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
              <p
                className={`${styles.message} ${
                  message
                    ? status === "success"
                      ? styles.messageSuccess
                      : styles.messageError
                    : ""
                }`}
                id={messageId}
                role={status === "error" ? "alert" : "status"}
              >
                {message ?? "\u00a0"}
              </p>
              <p className={styles.legalNote}>
                {localeCopy.consentPrefix}{" "}
                <Link href="/terms">{localeCopy.terms}</Link>{" "}
                {localeCopy.consentJoin}{" "}
                <Link href="/privacy">{localeCopy.privacy}</Link>.
              </p>
            </form>
          </section>
        </div>

        <section className={styles.faq}>
          <p className={styles.kicker}>{localeCopy.faqTitle}</p>
          <div className={styles.accordion}>
            {localeCopy.faqs.map((item, index) => {
              const open = openItem === index;
              const triggerId = `waitlist-faq-trigger-${index}`;
              const panelId = `waitlist-faq-panel-${index}`;
              return (
                <section className={styles.accordionItem} key={item.question}>
                  <button
                    aria-controls={panelId}
                    aria-expanded={open}
                    className={styles.accordionTrigger}
                    id={triggerId}
                    onClick={() => setOpenItem(open ? -1 : index)}
                    type="button"
                  >
                    <span>{item.question}</span>
                    <span aria-hidden="true">
                      {open ? (
                        <X size={17} strokeWidth={2} />
                      ) : (
                        <Plus size={17} strokeWidth={2} />
                      )}
                    </span>
                  </button>
                  {open ? (
                    <div
                      aria-labelledby={triggerId}
                      className={styles.accordionContent}
                      id={panelId}
                      role="region"
                    >
                      <p>{item.answer}</p>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
        <footer className={styles.footer}>
          <span>© 2026 OpenSocial</span>
          <nav aria-label="Legal pages" className={styles.footerLinks}>
            <Link href="/privacy">{localeCopy.legalLinks.privacy}</Link>
            <Link href="/terms">{localeCopy.legalLinks.terms}</Link>
            <Link href="/security">{localeCopy.legalLinks.security}</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
