import { applyTheme } from "../lib/theme.js";

applyTheme();

const $ = (sel) => document.querySelector(sel);

async function load() {
  const s = await chrome.storage.sync.get([
    "apiKey",
    "redirectUrl",
    "theme",
  ]);
  $("#apiKey").value = s.apiKey || "";
  $("#redirectUrl").value = s.redirectUrl || "https://mayar.id/";
  $("#theme").value = s.theme || "light";
}

// Live preview: apply theme as soon as the user picks one
$("#theme").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ theme: e.target.value });
});

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const apiKey = $("#apiKey").value.trim();
  const redirectUrl = $("#redirectUrl").value.trim() || "https://mayar.id/";
  const theme = $("#theme").value;

  await chrome.storage.sync.set({ apiKey, redirectUrl, theme });

  const saved = $("#saved");
  saved.classList.remove("hidden");
  setTimeout(() => saved.classList.add("hidden"), 1500);
});

load();
