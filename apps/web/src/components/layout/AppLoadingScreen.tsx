export function AppLoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        background: "#040404",
        gap: "28px",
      }}
    >
      {/* Logo mark */}
      <div style={{ position: "relative" }}>
        {/* Ambient glow behind logo */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-40px",
            background: "radial-gradient(circle, rgba(109,59,255,0.22) 0%, transparent 70%)",
            filter: "blur(20px)",
            animation: "ls-pulse 2.8s ease-in-out infinite",
          }}
        />
        <svg
          viewBox="0 0 1024 1024"
          aria-hidden="true"
          style={{ width: 48, height: 48, position: "relative", display: "block" }}
        >
          <path
            d="M 512 309 A 228 228 0 0 0 512 755 A 228 228 0 0 0 512 309 Z"
            fill="rgba(245,245,247,0.9)"
          />
          <circle cx="407" cy="532" r="228" fill="none" stroke="rgba(245,245,247,0.9)" strokeWidth="42" />
          <circle cx="617" cy="532" r="228" fill="none" stroke="rgba(245,245,247,0.9)" strokeWidth="42" />
        </svg>
      </div>

      {/* Thin progress line */}
      <div
        style={{
          width: 48,
          height: 1,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 1,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
            animation: "ls-shimmer 1.6s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes ls-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes ls-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <span className="sr-only">{label}</span>
    </main>
  );
}
