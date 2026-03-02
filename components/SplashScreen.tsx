"use client";

import React, { useEffect, useState } from "react";

interface SplashScreenProps {
  loading: boolean;
}

export default function SplashScreen({ loading }: SplashScreenProps) {
  const [phase, setPhase] = useState<"intro" | "ready" | "out" | "gone">("intro");

  useEffect(() => {
    // Show intro for at least 2.5s so the title is fully visible
    const introTimer = setTimeout(() => {
      setPhase("ready");
    }, 2500);
    return () => clearTimeout(introTimer);
  }, []);

  useEffect(() => {
    if (phase === "ready" && !loading) {
      const t = setTimeout(() => setPhase("out"), 300);
      return () => clearTimeout(t);
    }
  }, [phase, loading]);

  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => setPhase("gone"), 900);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#010204",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        overflow: "hidden",
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 0.8s ease-out",
      }}
    >
      {/* Faint radial glow behind center */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,229,255,0.04) 0%, rgba(0,229,255,0.01) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Orbit rings animation */}
      <div style={{ position: "relative", width: 120, height: 120, marginBottom: 40 }}>
        {[40, 52, 64].map((r, i) => (
          <div
            key={r}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              marginTop: -r,
              border: `1px solid rgba(0,229,255,${0.08 + i * 0.04})`,
              borderRadius: "50%",
              animation: `splashOrbit ${6 + i * 2}s linear infinite${i % 2 ? " reverse" : ""}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -2,
                left: "50%",
                marginLeft: -2,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: `rgba(0,229,255,${0.3 + i * 0.15})`,
                boxShadow: `0 0 6px rgba(0,229,255,${0.2 + i * 0.1})`,
              }}
            />
          </div>
        ))}
        {/* Center sun */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            borderRadius: "50%",
            background: "rgba(255,200,100,0.8)",
            boxShadow:
              "0 0 12px 3px rgba(255,180,60,0.4), 0 0 30px 8px rgba(255,150,30,0.15)",
          }}
        />
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 8,
          animation: "splashFadeUp 1s ease forwards",
          animationDelay: "0.3s",
          opacity: 0,
        }}
      >
        {"VESCROW".split("").map((ch, i) => (
          <span
            key={`a${i}`}
            style={{
              color: "#00e5ff",
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.22em",
              opacity: 0,
              animation: "splashLetter 0.5s ease forwards",
              animationDelay: `${0.4 + i * 0.04}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 28,
          animation: "splashFadeUp 1s ease forwards",
          animationDelay: "0.8s",
          opacity: 0,
        }}
      >
        {"SYSTEM ALPHA".split("").map((ch, i) => (
          <span
            key={`b${i}`}
            style={{
              color: "#2a5a78",
              fontSize: 13,
              fontWeight: 400,
              letterSpacing: "0.35em",
              opacity: 0,
              animation: "splashLetter 0.5s ease forwards",
              animationDelay: `${0.9 + i * 0.03}s`,
              display: ch === " " ? "inline-block" : "inline",
              width: ch === " " ? "0.5em" : "auto",
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Tagline */}
      <div
        style={{
          color: "#2a4058",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          animation: "splashFadeUp 0.8s ease forwards",
          animationDelay: "1.4s",
          opacity: 0,
          marginBottom: 20,
        }}
      >
        your voting power, visualized
      </div>

      {/* Loading indicator */}
      <div
        style={{
          width: 120,
          height: 1,
          background: "rgba(0,229,255,0.06)",
          overflow: "hidden",
          animation: "splashFadeUp 0.6s ease forwards",
          animationDelay: "1.6s",
          opacity: 0,
        }}
      >
        <div
          style={{
            width: "30%",
            height: "100%",
            background:
              "linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent)",
            animation: "splashBar 1.8s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes splashOrbit { to { transform: rotate(360deg); } }
        @keyframes splashLetter {
          0%   { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashFadeUp {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashBar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(500%); }
        }
      `}</style>
    </div>
  );
}
