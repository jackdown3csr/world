import Link from "next/link";

interface AppStateScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  detail?: string;
  tone?: "info" | "warning" | "error";
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  busy?: boolean;
}

export default function AppStateScreen({
  eyebrow,
  title,
  description,
  detail,
  tone = "info",
  primaryAction,
  secondaryAction,
  busy = false,
}: AppStateScreenProps) {
  const accent = tone === "error"
    ? "#ff8f7a"
    : tone === "warning"
      ? "#ffd36e"
      : "#7ef1ff";

  const renderAction = (
    action: AppStateScreenProps["primaryAction"],
    variant: "primary" | "secondary",
  ) => {
    if (!action) return null;

    const content = (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 124,
        height: 40,
        padding: "0 16px",
        borderRadius: 12,
        border: variant === "primary"
          ? `1px solid ${accent}33`
          : "1px solid rgba(255,255,255,0.08)",
        background: variant === "primary"
          ? `${accent}12`
          : "rgba(255,255,255,0.03)",
        color: variant === "primary" ? accent : "#c7dae4",
        letterSpacing: "0.02em",
        textTransform: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}>
        {action.label}
      </span>
    );

    if (action.href) {
      return <Link href={action.href}>{content}</Link>;
    }

    return (
      <button
        type="button"
        onClick={action.onClick}
        style={{ background: "transparent", border: 0, padding: 0 }}
      >
        {content}
      </button>
    );
  };

  return (
    <main style={{
      minHeight: "100vh",
      width: "100%",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      position: "relative",
      background: "radial-gradient(circle at 50% 20%, rgba(38,74,96,0.16), transparent 34%), linear-gradient(180deg, #02060d 0%, #040913 52%, #02050b 100%)",
      color: "#e3f3fb",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
      padding: "24px",
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(126,241,255,0.016) 1px, transparent 1px), linear-gradient(90deg, rgba(126,241,255,0.014) 1px, transparent 1px)",
        backgroundSize: "160px 160px",
        maskImage: "radial-gradient(circle at center, black 26%, transparent 86%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), transparent 16%, transparent 84%, rgba(255,255,255,0.02))",
        opacity: 0.35,
        pointerEvents: "none",
      }} />

      <section style={{
        position: "relative",
        width: "min(100%, 560px)",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(5,10,18,0.90), rgba(4,8,15,0.82))",
        boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
        padding: "26px 24px 24px",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 10px ${accent}66`,
            animation: busy ? "appStatePulse 1.2s ease-in-out infinite" : undefined,
          }} />
          <div style={{
            color: accent,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "none",
          }}>
            {eyebrow}
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 14,
        }}>
          <h1 style={{
            fontSize: "clamp(28px, 5vw, 38px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            textTransform: "none",
            color: "#f2fbff",
            margin: 0,
          }}>
            {title}
          </h1>

          <p style={{
            color: "#9fb7c7",
            fontSize: 14,
            lineHeight: 1.65,
            maxWidth: 480,
            margin: 0,
          }}>
            {description}
          </p>

          {detail ? (
            <div style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.025)",
              color: "#8ea6b8",
              fontSize: 11,
              lineHeight: 1.6,
              wordBreak: "break-word",
            }}>
              {detail}
            </div>
          ) : null}

          {(primaryAction || secondaryAction) ? (
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 2,
            }}>
              {renderAction(primaryAction, "primary")}
              {renderAction(secondaryAction, "secondary")}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
