"use client";

import React, { useEffect, useState, useRef } from "react";

interface SplashScreenProps {
  loading: boolean;
}

/* ---------- tiny procedural starfield on a canvas ---------- */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    cvs.width = w;
    cvs.height = h;

    const STAR_COUNT = 260;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.5 + 0.15,
      speed: Math.random() * 0.008 + 0.003,
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let t = 0;
    function draw() {
      t += 1;
      ctx!.clearRect(0, 0, w, h);
      for (const s of stars) {
        const flicker = 0.6 + 0.4 * Math.sin(t * s.speed + s.phase);
        ctx!.globalAlpha = s.a * flicker;
        ctx!.fillStyle = "#c8dce8";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      cvs!.width = w;
      cvs!.height = h;
      for (const s of stars) {
        s.x = Math.random() * w;
        s.y = Math.random() * h;
      }
    }
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

export default function SplashScreen({ loading }: SplashScreenProps) {
  const [phase, setPhase] = useState<"intro" | "ready" | "out" | "gone">("intro");

  useEffect(() => {
    const introTimer = setTimeout(() => setPhase("ready"), 3500);
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

  const rings = [
    { r: 36, dur: 14, opacity: 0.06, dotOpacity: 0.25, dotSize: 3 },
    { r: 50, dur: 20, opacity: 0.09, dotOpacity: 0.35, dotSize: 3.5, reverse: true },
    { r: 66, dur: 28, opacity: 0.12, dotOpacity: 0.45, dotSize: 4 },
    { r: 86, dur: 38, opacity: 0.06, dotOpacity: 0.22, dotSize: 2.5, reverse: true },
  ];

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
      {/* Procedural star field */}
      <Starfield />

      {/* Layered radial glows */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,131,42,0.035) 0%, rgba(232,131,42,0.01) 30%, transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,200,100,0.06) 0%, transparent 55%)",
          pointerEvents: "none",
        }}
      />

      {/* Orbit orrery */}
      <div style={{ position: "relative", width: 180, height: 180, marginBottom: 36 }}>
        {rings.map(({ r, dur, opacity, dotOpacity, dotSize, reverse }, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              marginTop: -r,
              border: `1px solid rgba(0,229,255,${opacity})`,
              borderRadius: "50%",
              animation: `splashOrbit ${dur}s linear infinite${reverse ? " reverse" : ""}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -dotSize / 2,
                left: "50%",
                marginLeft: -dotSize / 2,
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: `rgba(0,229,255,${dotOpacity})`,
                boxShadow: `0 0 ${dotSize * 2}px rgba(0,229,255,${dotOpacity * 0.6})`,
              }}
            />
          </div>
        ))}
        {/* Sun core */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 10,
            height: 10,
            marginLeft: -5,
            marginTop: -5,
            borderRadius: "50%",
            background: "rgba(255,200,100,0.85)",
            boxShadow:
              "0 0 8px 2px rgba(255,180,60,0.5), 0 0 22px 6px rgba(255,150,30,0.2), 0 0 44px 14px rgba(255,130,20,0.08)",
            animation: "splashPulse 3s ease-in-out infinite",
          }}
        />
      </div>

      {/* Title: SECTOR */}
      <div
        style={{
          display: "flex",
          gap: 3,
          marginBottom: 3,
          opacity: 0,
          animation: "splashFadeUp 1s ease forwards",
          animationDelay: "0.3s",
        }}
      >
        {"SECTOR".split("").map((ch, i) => (
          <span
            key={`a${i}`}
            style={{
              color: "#ffd3a1",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.24em",
              opacity: 0,
              animation: "splashLetter 0.5s ease forwards",
              animationDelay: `${0.4 + i * 0.05}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Title: GALACTICA */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 20,
          opacity: 0,
          animation: "splashFadeUp 1s ease forwards",
          animationDelay: "0.8s",
        }}
      >
        {"GALACTICA".split("").map((ch, i) => (
          <span
            key={`b${i}`}
            style={{
              color: "#E8832A",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.38em",
              opacity: 0,
              animation: "splashLetter 0.5s ease forwards",
              animationDelay: `${0.9 + i * 0.035}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Thin decorative line */}
      <div
        style={{
          width: 64,
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(232,131,42,0.28), transparent)",
          marginBottom: 14,
          opacity: 0,
          animation: "splashFadeUp 0.8s ease forwards",
          animationDelay: "1.3s",
        }}
      />

      {/* Tagline */}
      <div
        style={{
          color: "rgba(200,220,232,0.42)",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.20em",
          textTransform: "uppercase",
          opacity: 0,
          animation: "splashFadeUp 0.8s ease forwards",
          animationDelay: "1.5s",
          marginBottom: 28,
        }}
      >
        Contracts and capital flows. Visualized.
      </div>

      {/* Loading bar */}
      <div
        style={{
          width: 100,
          height: 1,
          background: "rgba(232,131,42,0.10)",
          overflow: "hidden",
          borderRadius: 1,
          opacity: 0,
          animation: "splashFadeUp 0.6s ease forwards",
          animationDelay: "1.7s",
        }}
      >
        <div
          style={{
            width: "28%",
            height: "100%",
            background:
              "linear-gradient(90deg, transparent, rgba(232,131,42,0.55), transparent)",
            animation: "splashBar 2s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes splashOrbit { to { transform: rotate(360deg); } }
        @keyframes splashPulse {
          0%, 100% { box-shadow: 0 0 8px 2px rgba(255,180,60,0.5), 0 0 22px 6px rgba(255,150,30,0.2), 0 0 44px 14px rgba(255,130,20,0.08); }
          50% { box-shadow: 0 0 12px 3px rgba(255,180,60,0.6), 0 0 28px 8px rgba(255,150,30,0.25), 0 0 52px 18px rgba(255,130,20,0.1); }
        }
        @keyframes splashLetter {
          0%   { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashFadeUp {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashBar {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(480%); }
        }
      `}</style>
    </div>
  );
}
