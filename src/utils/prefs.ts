import { config } from "../../package.json";

// prefsPrefix in package.json is "extensions.sonicnotesync".
const PREFIX = config.prefsPrefix;

type PrefValue = string | boolean | number;

export function getPref(key: string): PrefValue | undefined {
  // global=true → the pref key is a full preference path
  return Zotero.Prefs.get(`${PREFIX}.${key}`, true) as PrefValue | undefined;
}

export function setPref(key: string, value: PrefValue): void {
  Zotero.Prefs.set(`${PREFIX}.${key}`, value, true);
}

export function getStringPref(key: string): string {
  const v = getPref(key);
  return typeof v === "string" ? v : "";
}

export function getBoolPref(key: string): boolean {
  const v = getPref(key);
  return v === true || v === "true";
}

export function getIntPref(key: string): number {
  const v = getPref(key);
  if (typeof v === "number") return v;
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
