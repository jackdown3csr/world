export type ShortcutDef = {
  keys: string;
  description: string;
  context?: string;
};

export const toolbarShortcutMeta = {
  labels: { keys: "L", description: "Toggle all labels", context: "toolbar" },
  named: { keys: "N", description: "Toggle named-only labels", context: "toolbar" },
  orbits: { keys: "O", description: "Toggle orbit rings", context: "toolbar" },
  ranked: { keys: "K", description: "Toggle ranked layout", context: "toolbar" },
  gnet: { keys: "J", description: "Toggle GNET ranking in ranked mode", context: "toolbar" },
  claimed: { keys: "C", description: "Toggle claimed vesting layout", context: "toolbar" },
  fly: { keys: "G", description: "Toggle fly mode", context: "toolbar" },
  photo: { keys: "P", description: "Enter photo mode", context: "toolbar" },
  reset: { keys: "R", description: "Reset camera to overview", context: "toolbar" },
  help: { keys: "H", description: "Open or close help", context: "toolbar" },
} as const;

export const toolbarShortcuts = {
  labels: toolbarShortcutMeta.labels.keys,
  named: toolbarShortcutMeta.named.keys,
  orbits: toolbarShortcutMeta.orbits.keys,
  ranked: toolbarShortcutMeta.ranked.keys,
  gnet: toolbarShortcutMeta.gnet.keys,
  claimed: toolbarShortcutMeta.claimed.keys,
  fly: toolbarShortcutMeta.fly.keys,
  photo: toolbarShortcutMeta.photo.keys,
  reset: toolbarShortcutMeta.reset.keys,
  help: toolbarShortcutMeta.help.keys,
} as const;

export const navigationShortcuts: ShortcutDef[] = [
  { keys: "W / S", description: "Pitch down or up", context: "fly" },
  { keys: "A / D", description: "Yaw left or right", context: "fly" },
  { keys: "Q / E", description: "Roll left or right", context: "fly" },
  { keys: "CapsLock", description: "Toggle fine control for gentler steering", context: "fly" },
  { keys: "R", description: "Toggle RCS translation thrusters", context: "fly" },
  { keys: "H / N", description: "RCS forward or back", context: "fly" },
  { keys: "J / L", description: "RCS left or right", context: "fly" },
  { keys: "I / K", description: "RCS down or up", context: "fly" },
  { keys: "Shift / Ctrl", description: "Throttle up or down", context: "fly" },
  { keys: "Z / X", description: "Set full or zero throttle", context: "fly" },
  { keys: "Scroll", description: "Zoom in orbit mode", context: "scene" },
  { keys: "Drag", description: "Look around or orbit the focused target", context: "scene" },
  { keys: "Shift + Click", description: "Inspect a raw contract storage view", context: "scene" },
  { keys: "Escape", description: "Detach from the current focus", context: "scene" },
];

export const photoModeShortcuts: ShortcutDef[] = [
  { keys: toolbarShortcuts.photo, description: toolbarShortcutMeta.photo.description, context: "toolbar" },
  { keys: "Space", description: "Capture PNG screenshot.", context: "photo" },
  { keys: "Esc", description: "Exit photo mode.", context: "photo" },
  { keys: "T", description: "Open the photo object picker.", context: "photo" },
  { keys: "V", description: "Detach into cinematic free movement.", context: "photo" },
  { keys: "F", description: "Refocus the current photo target.", context: "photo" },
  { keys: "G", description: "Cycle clean / grid / scope overlay.", context: "photo" },
  { keys: "H", description: "Hide or show photo HUD.", context: "photo" },
  { keys: "M", description: "Toggle frozen / live simulation.", context: "photo" },
];

export const toolbarActionShortcuts: ShortcutDef[] = Object.values(toolbarShortcutMeta);

export function getShortcutByKey(shortcuts: ShortcutDef[], key: string) {
  return shortcuts.find((item) => item.keys.toLowerCase() === key.toLowerCase()) ?? null;
}
