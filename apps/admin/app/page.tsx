"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { AdminShell } from "./components/AdminShell";
import { AdminSignIn } from "./components/AdminSignIn";
import { AppLoading } from "./components/AppLoading";
import { WorkbenchContent } from "./components/workbench/WorkbenchContent";
import {
  tabConfig,
  tabSubtitle,
  useAdminHomeController,
} from "./components/workbench/useAdminHomeController";
import { t } from "./lib/i18n";

function AdminHomeContent() {
  const {
    activeTab,
    banner,
    busyKey,
    locale,
    sessionHydrated,
    sessionLabel,
    signedInSession,
    signInError,
    startGoogleSignIn,
    setActiveTab,
    setLocale,
    signOut,
    summary,
    workbenchTabProps,
  } = useAdminHomeController();

  if (!sessionHydrated) {
    return <AppLoading label="Restoring session…" />;
  }

  if (!signedInSession) {
    return (
      <AdminSignIn errorText={signInError} onGoogleSignIn={startGoogleSignIn} />
    );
  }

  return (
    <AdminShell
      activeId={activeTab}
      busyKey={busyKey}
      busyPrefixLabel={t("busyPrefix", locale)}
      navItems={tabConfig.map((tab) => ({ id: tab.id, label: tab.label }))}
      locale={locale}
      localeEnglishLabel={t("english", locale)}
      localeLabel={t("language", locale)}
      localeSpanishLabel={t("spanish", locale)}
      onNavigate={(id) => setActiveTab(id as (typeof tabConfig)[number]["id"])}
      onLocaleChange={setLocale}
      onSignOut={signOut}
      operatorContextNote={t("operatorContextNote", locale)}
      readyLabel={t("ready", locale)}
      sessionLabel={sessionLabel}
      sessionTitle={
        signedInSession.email ??
        signedInSession.displayName ??
        signedInSession.userId
      }
      signOutLabel={t("signOut", locale)}
      activeDescription={tabSubtitle(activeTab)}
      subtitle="OpenSocial"
      summary={summary}
      title="Operations workbench"
    >
      <WorkbenchContent
        activeTab={activeTab}
        banner={banner}
        tabSubtitle={tabSubtitle}
        {...workbenchTabProps}
      />
    </AdminShell>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AdminHomeContent />
    </Suspense>
  );
}
