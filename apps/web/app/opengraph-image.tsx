import { ImageResponse } from "next/og";

export const alt = "OpenSocial";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#11110f",
        color: "#f6f3ec",
        padding: 72,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 30,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#f6f3ec",
          }}
        />
        OpenSocial
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            maxWidth: 880,
            fontSize: 82,
            lineHeight: 0.92,
            letterSpacing: "-0.065em",
            fontWeight: 800,
          }}
        >
          Social coordination that starts with intent.
        </div>
        <div
          style={{
            maxWidth: 680,
            color: "rgba(246, 243, 236, 0.72)",
            fontSize: 30,
            lineHeight: 1.28,
          }}
        >
          Express what you want, find the right people, and move toward real
          human connection.
        </div>
      </div>
    </div>,
    size,
  );
}
