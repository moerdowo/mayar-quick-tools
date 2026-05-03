const VALID = new Set([
  "system",
  "light",
  "dark",
  "neon",
  "matrix",
  "tokyo",
]);

function resolve(theme) {
  if (theme === "system") {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function set(theme) {
  document.documentElement.dataset.theme = resolve(theme);
}

export async function applyTheme() {
  const { theme = "light" } = await chrome.storage.sync.get(["theme"]);
  const t = VALID.has(theme) ? theme : "light";
  set(t);

  // React to OS changes when in system mode
  if (t === "system" && matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      () => set("system")
    );
  }

  // React to settings changes from the options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.theme) {
      set(changes.theme.newValue || "light");
    }
  });
}
