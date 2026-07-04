import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

try {
  const basicTool = new BasicTool();
  const ZoteroGlobal = basicTool.getGlobal("Zotero") as Record<
    string,
    unknown
  >;
  if (!ZoteroGlobal[config.addonInstance]) {
    _globalThis.addon = new Addon();
    defineGlobal("ztoolkit", () => _globalThis.addon.data.ztoolkit);
    ZoteroGlobal[config.addonInstance] = _globalThis.addon;
    Zotero.debug("[SonicNote Sync] initialized OK");
  }
} catch (e) {
  // Surface init errors to Zotero's debug log so they are not swallowed.
  try {
    Zotero?.debug?.(
      "[SonicNote Sync] init error: " + ((e as Error)?.stack || e),
    );
  } catch {
    // last resort — ignore
  }
}

function defineGlobal(name: string, getter: () => unknown): void {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter();
    },
  });
}
