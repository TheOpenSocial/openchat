import type { ReactNode } from "react";

import { BRAND_SIGN_IN_BACKDROP_STILL } from "../lib/brand-backdrop";

/**
 * Full-viewport black canvas + still + scrim — aligned with mobile `AuthScreen` / admin `AdminSignIn`.
 */
export function BrandSignInLayout({
  children,
  contentClassName = "",
}: {
  children: ReactNode;
  /** Inner column wrapper (centering, max-width, padding). */
  contentClassName?: string;
}) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22] saturate-[0.85]"
        style={{ backgroundImage: `url('${BRAND_SIGN_IN_BACKDROP_STILL}')` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/95"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,rgba(245,158,11,0.12),transparent_55%)]"
      />

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 py-14 sm:px-8 ${contentClassName}`}
      >
        {children}
      </div>
    </main>
  );
}
