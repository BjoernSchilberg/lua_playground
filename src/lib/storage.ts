import { STORAGE_KEY } from "./constants";

export function getSavedScripts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveScript(name: string, code: string) {
  const scripts = getSavedScripts();
  scripts[name] = code;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function deleteScript(name: string) {
  const scripts = getSavedScripts();
  delete scripts[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}
