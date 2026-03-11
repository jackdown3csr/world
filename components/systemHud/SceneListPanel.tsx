"use client";

import React from "react";

export interface SceneListItem {
	id: string;
	label: string;
	metric?: string;
	accent?: string;
	dotColor?: string;
	detail?: string;
}

export interface SceneListGroup {
	key: string;
	label: string;
	count?: number;
	items: SceneListItem[];
}

export interface SceneListSection {
	key: string;
	label?: string;
	accent?: string;
	groups: SceneListGroup[];
}

export function buildSceneListPanelStyle(attached = false): React.CSSProperties {
	return {
		background: "rgba(2, 6, 14, 0.92)",
		border: "1px solid rgba(0,229,255,0.12)",
		borderTop: attached ? "none" : undefined,
		borderLeft: "2px solid rgba(0,229,255,0.25)",
		borderRadius: attached ? "0 0 0 8px" : undefined,
		maxHeight: "60vh",
		overflowY: "auto",
		padding: 0,
	};
}

const sectionStyle: React.CSSProperties = {
	paddingTop: 2,
};

const sectionTitleStyle: React.CSSProperties = {
	padding: "8px 10px 4px",
	color: "#7aa6bb",
	fontSize: 9,
	fontWeight: 700,
	letterSpacing: "0.16em",
	textTransform: "uppercase",
};

const groupHeaderStyle: React.CSSProperties = {
	padding: "8px 10px 4px",
	color: "#5a7a90",
	fontSize: 9,
	fontWeight: 600,
	letterSpacing: "0.15em",
	textTransform: "uppercase",
	borderBottom: "1px solid rgba(0,229,255,0.04)",
};

function rowStyle(isSelected: boolean): React.CSSProperties {
	return {
		display: "flex",
		alignItems: "center",
		gap: 8,
		width: "100%",
		padding: "4px 10px",
		border: "none",
		fontFamily: "inherit",
		background: isSelected ? "rgba(0,229,255,0.06)" : "transparent",
		cursor: "pointer",
		textAlign: "left",
		borderBottom: "1px solid rgba(255,255,255,0.02)",
		transition: "background 0.1s",
	};
}

interface SceneListPanelProps {
	sections: SceneListSection[];
	selectedId: string | null;
	onSelect: (item: SceneListItem) => void;
	attached?: boolean;
}

export default function SceneListPanel({
	sections,
	selectedId,
	onSelect,
	attached = false,
}: SceneListPanelProps) {
	const selected = selectedId?.toLowerCase() ?? "";

	return (
		<div style={buildSceneListPanelStyle(attached)}>
			{sections.map((section) => (
				<div key={section.key} style={sectionStyle}>
					{section.label ? (
						<div style={{ ...sectionTitleStyle, color: section.accent ?? sectionTitleStyle.color }}>
							{section.label}
						</div>
					) : null}
					{section.groups.map((group) => (
						<div key={group.key}>
							<div style={groupHeaderStyle}>
								{group.label}
								{typeof group.count === "number" ? ` // ${group.count}` : ""}
							</div>
							{group.items.map((item) => {
								const isSelected = selected === item.id.toLowerCase();
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => onSelect(item)}
										style={rowStyle(isSelected)}

									>
										<span
											style={{
												width: 6,
												height: 6,
												flexShrink: 0,
												borderRadius: "50%",
												background: item.dotColor ?? "rgba(0,229,255,0.5)",
												boxShadow: item.dotColor ? `0 0 4px ${item.dotColor}` : undefined,
											}}
										/>
										<span
											style={{
												color: "#8a9bb0",
												fontSize: 11,
												flex: 1,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{item.label}
										</span>
										{item.metric ? (
											<span
												style={{
													color: item.accent ?? "#00e5ff",
													fontSize: 9,
													flexShrink: 0,
													fontVariantNumeric: "tabular-nums",
													opacity: 0.72,
												}}
											>
												{item.metric}
											</span>
										) : null}
									</button>
								);
							})}
						</div>
					))}
				</div>
			))}
		</div>
	);
}
