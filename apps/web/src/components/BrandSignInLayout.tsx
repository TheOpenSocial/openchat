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
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.28] saturate-[0.82]"
        style={{ backgroundImage: `url('${BRAND_SIGN_IN_BACKDROP_STILL}')` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,14,0.88)_0%,rgba(5,8,14,0.74)_34%,rgba(5,8,14,0.56)_58%,rgba(5,8,14,0.88)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(245,158,11,0.18),transparent_26%),radial-gradient(circle_at_78%_16%,rgba(56,109,179,0.16),transparent_26%)]"
      />

      <div className="relative z-10 min-h-screen w-full px-6 py-10 sm:px-8 lg:px-12">
        <div
          className={`mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[1240px] flex-col justify-between ${contentClassName}`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
