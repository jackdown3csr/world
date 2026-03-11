"use client";

import React from "react";
import SceneListPanel from "./SceneListPanel";
import type { PhotoTargetSection, PhotoTargetItem } from "@/lib/photoTargets";

interface PhotoObjectPickerProps {
  sections: PhotoTargetSection[];
  selectedId: string | null;
  onSelect: (item: PhotoTargetItem) => void;
}

type BrowserView =
  | { kind: "root" }
  | { kind: "section"; systemKey: string };

type FolderRow = {
  type: "folder";
  key: string;
  label: string;
  metric: string;
  accent?: string;
  onClick: () => void;
};

type TargetRow = {
  type: "target";
  item: PhotoTargetItem;
};

type RootRow = FolderRow | TargetRow;

const shellStyle: React.CSSProperties = {
  background: "rgba(2, 6, 14, 0.96)",
  border: "1px solid rgba(0,229,255,0.12)",
  borderLeft: "2px solid rgba(0,229,255,0.25)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px 7px",
  borderBottom: "1px solid rgba(0,229,255,0.08)",
};

const crumbStyle: React.CSSProperties = {
  color: "#8a9bb0",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const backButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,229,255,0.16)",
  background: "rgba(255,255,255,0.03)",
  color: "#c8f6ff",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const folderListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  maxHeight: "60vh",
  overflowY: "auto",
};

const rootSectionLabelStyle: React.CSSProperties = {
  padding: "6px 10px 3px",
  color: "#6d8798",
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  borderTop: "1px solid rgba(255,255,255,0.03)",
};

function folderRowStyle(accent?: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "6px 10px",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    background: "transparent",
    color: "#dfefff",
    textAlign: "left",
    cursor: "pointer",
    transition: "background 0.12s ease",
    fontFamily: "inherit",
  };
}

function targetRowStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "6px 10px",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    background: isSelected ? "rgba(0,229,255,0.06)" : "transparent",
    color: "#dfefff",
    textAlign: "left",
    cursor: "pointer",
    transition: "background 0.12s ease",
    fontFamily: "inherit",
  };
}

function compactRootTargetDetail(item: PhotoTargetItem) {
  if (item.kind === "comet") return "comet";
  if (item.kind === "bridge") return "bridge";
  return item.detail ?? item.kind;
}

function compactRootTargetMetric(item: PhotoTargetItem) {
  if (!item.metric) return item.kind;
  if (item.kind !== "bridge") return item.metric;

  return item.metric
    .replace(" dispatches / 24h", " / 24h")
    .replace(" withdrawals / 24h", " / 24h");
}

function countItems(section: PhotoTargetSection) {
  return section.groups.reduce((sum, group) => sum + group.items.length, 0);
}

function formatPathLabel(view: BrowserView, currentSection: PhotoTargetSection | null) {
  if (view.kind === "root") return "scene browser";
  return `scene browser / ${currentSection?.label ?? "unknown"}`;
}

function getPreviousView(view: BrowserView): BrowserView {
  if (view.kind !== "root") return { kind: "root" };
  return view;
}

export default function PhotoObjectPicker({
  sections,
  selectedId,
  onSelect,
}: PhotoObjectPickerProps) {
  const [view, setView] = React.useState<BrowserView>({ kind: "root" });
  const sceneObjectsSection = React.useMemo(
    () => sections.find((section) => section.key === "scene-objects") ?? null,
    [sections],
  );
  const systemSections = React.useMemo(
    () => sections.filter((section) => section.key !== "scene-objects"),
    [sections],
  );
  const resolvedSection = React.useMemo(() => {
    if (view.kind !== "section") return null;
    return systemSections.find((section) => section.key === view.systemKey) ?? null;
  }, [systemSections, view]);

  React.useEffect(() => {
    if (view.kind === "section" && !resolvedSection) {
      setView({ kind: "root" });
    }
  }, [resolvedSection, view]);

  const pathLabel = formatPathLabel(view, resolvedSection);
  const selected = selectedId?.toLowerCase() ?? "";

  const rootRows = React.useMemo<RootRow[]>(() => {
    const rows: RootRow[] = [];

    for (const section of systemSections) {
      rows.push({
        type: "folder",
        key: section.key,
        label: section.label ?? section.key,
        metric: `${countItems(section)} targets`,
        accent: section.accent,
        onClick: () => setView({ kind: "section", systemKey: section.key }),
      });
    }

    if (sceneObjectsSection) {
      rows.push(...sceneObjectsSection.groups.flatMap((group) => group.items.map((item) => ({
        type: "target" as const,
        item,
      }))));
    }

    return rows;
  }, [sceneObjectsSection, systemSections]);

  const rootSystemRows = React.useMemo(
    () => rootRows.filter((row): row is FolderRow => row.type === "folder"),
    [rootRows],
  );
  const rootTargetRows = React.useMemo(
    () => rootRows.filter((row): row is TargetRow => row.type === "target"),
    [rootRows],
  );

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={crumbStyle}>{pathLabel}</div>
          {view.kind === "section" ? (
            <div
              style={{
                color: "rgba(223,239,255,0.68)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              choose target
            </div>
          ) : null}
        </div>
        {view.kind !== "root" ? (
          <button
            type="button"
            onClick={() => setView(getPreviousView(view))}
            style={backButtonStyle}
            title="Go back"
          >
            back
          </button>
        ) : null}
      </div>

      {resolvedSection ? (
        <SceneListPanel
          sections={[{ ...resolvedSection, label: undefined }]}
          selectedId={selectedId}
          onSelect={(item) => onSelect(item as PhotoTargetItem)}
        />
      ) : (
        <div style={folderListStyle}>
          {rootSystemRows.length > 0 ? (
            <div style={rootSectionLabelStyle}>systems</div>
          ) : null}
          {rootSystemRows.map((row) => {
            return (
              <button
                key={row.key}
                type="button"
                onClick={row.onClick}
                style={folderRowStyle(row.accent)}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = "rgba(0,229,255,0.05)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: row.accent ?? "rgba(0,229,255,0.55)",
                    boxShadow: row.accent ? `0 0 6px ${row.accent}` : undefined,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      color: "#e6f7ff",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {row.label}
                  </span>
                </span>
                <span
                  style={{
                    color: row.accent ?? "#9cc9d8",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.78,
                    flexShrink: 0,
                  }}
                >
                  {row.metric}
                </span>
              </button>
            );
          })}
          {rootTargetRows.length > 0 ? (
            <div style={rootSectionLabelStyle}>scene objects</div>
          ) : null}
          {rootTargetRows.map((row) => {
            const { item } = row;
            const isSelected = selected === item.id.toLowerCase();

            if (row.type === "target") {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  style={targetRowStyle(isSelected)}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      flexShrink: 0,
                      borderRadius: "50%",
                      background: item.dotColor ?? "rgba(0,229,255,0.55)",
                      boxShadow: item.dotColor ? `0 0 6px ${item.dotColor}` : undefined,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        color: "#e6f7ff",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.label}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "rgba(138,155,176,0.8)",
                        fontSize: 9,
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {compactRootTargetDetail(item)}
                    </span>
                  </span>
                  <span
                    style={{
                      color: item.accent ?? "#9cc9d8",
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      opacity: 0.78,
                      flexShrink: 0,
                    }}
                  >
                    {compactRootTargetMetric(item)}
                  </span>
                </button>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}