import type { ZoteroToolkit } from "zotero-plugin-toolkit";

declare global {
  const __env__: "production" | "development";
  // Injected by bootstrap.js as the sandbox root (`ctx._globalThis = ctx`).
  const _globalThis: any;
  type ZToolkit = ZoteroToolkit;
}

export {};
