"use client";

import React from "react";

interface BugReportPanelProps {
  mobile?: boolean;
  connectedAddress?: string | null;
  reporterDefault?: string;
  selectedLabel?: string | null;
  onSubmitted?: () => void;
}

export default function BugReportPanel({
  mobile = false,
  connectedAddress = null,
  reporterDefault = "",
  selectedLabel = null,
  onSubmitted,
}: BugReportPanelProps) {
  const [reporter, setReporter] = React.useState(reporterDefault);
  const [message, setMessage] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setReporter(reporterDefault);
  }, [reporterDefault]);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedReporter = reporter.trim();

    if (!trimmedMessage) {
      setStatus("Please describe the bug first.");
      return;
    }

    try {
      setIsSending(true);
      setStatus(null);

      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter: trimmedReporter || null,
          message: trimmedMessage,
          walletAddress: connectedAddress || null,
          selectedLabel,
          userAgent: typeof window !== "undefined" ? window.navigator.userAgent : null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send bug report.");
      }

      setMessage("");
      setStatus("Bug report sent.");
      closeTimerRef.current = window.setTimeout(() => {
        onSubmitted?.();
      }, 850);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send bug report.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(4,10,18,0.96), rgba(2,6,14,0.92))",
        border: "1px solid rgba(0,229,255,0.10)",
        borderTop: mobile ? undefined : "none",
        borderLeft: mobile ? "none" : "2px solid rgba(255,170,110,0.34)",
        borderRadius: mobile ? 0 : "0 0 0 8px",
        padding: mobile ? "10px 12px 12px" : "12px 14px 14px",
        color: "#7a94aa",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: "#ffbf8f", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
          report
        </div>
        <div style={{ color: "#d3e5ec", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>
          Bug Report
        </div>
        <div style={{ color: "#6f879a", fontSize: 9, lineHeight: 1.5 }}>
          Send a quick note straight to Discord. No formal flow, just enough context to reproduce it.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#86a0b2", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Name
          </span>
          <input
            value={reporter}
            onChange={(e) => setReporter(e.target.value)}
            placeholder={connectedAddress ? "wallet holder" : "optional name"}
            maxLength={48}
            style={{
              height: 32,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#d8ecf5",
              borderRadius: 4,
              padding: "0 10px",
              fontSize: 11,
              letterSpacing: "0.04em",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </label>

        {connectedAddress && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#86a0b2", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Wallet
            </span>
            <div style={{ color: "#9fc3d2", fontSize: 10, wordBreak: "break-all", lineHeight: 1.5 }}>
              {connectedAddress}
            </div>
          </div>
        )}

        {selectedLabel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#86a0b2", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Context
            </span>
            <div style={{ color: "#9fc3d2", fontSize: 10 }}>
              {selectedLabel}
            </div>
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#86a0b2", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            What broke
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What did you click, what did you expect, and what actually happened?"
            rows={mobile ? 5 : 6}
            maxLength={1400}
            style={{
              resize: "vertical",
              minHeight: mobile ? 108 : 120,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#d8ecf5",
              borderRadius: 4,
              padding: "10px",
              fontSize: 11,
              lineHeight: 1.5,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: status?.includes("sent") ? "#6ef7a7" : "#7b90a1", fontSize: 10, lineHeight: 1.4 }}>
            {status ?? ""}
          </span>
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            style={{
              height: 32,
              minWidth: 92,
              borderRadius: 4,
              border: isSending || !message.trim()
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(255,170,110,0.30)",
              background: isSending || !message.trim()
                ? "rgba(255,255,255,0.03)"
                : "rgba(255,170,110,0.10)",
              color: isSending || !message.trim() ? "rgba(255,255,255,0.34)" : "#ffbf8f",
              cursor: isSending || !message.trim() ? "default" : "pointer",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "inherit",
              padding: "0 12px",
            }}
          >
            {isSending ? "sending" : "send bug"}
          </button>
        </div>
      </form>
    </div>
  );
}
