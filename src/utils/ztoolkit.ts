import { ZoteroToolkit } from "zotero-plugin-toolkit";

/**
 * Lazy + fault-tolerant. The bundled toolkit version may be incompatible with
 * a newer Zotero (e.g. Zotero 8/9 on Firefox 140), and construction must not
 * abort plugin init. We don't actually depend on the toolkit at runtime —
 * menus use native DOM, sync uses Zotero.ProgressWindow — so an undefined
 * toolkit is harmless.
 */
export function createZToolkit(): ZToolkit | undefined {
  try {
    return new ZoteroToolkit();
  } catch (e) {
    try {
      Zotero.debug(
        "[SonicNote Sync] createZToolkit failed (non-fatal): " +
          ((e as Error)?.stack || e),
      );
    } catch {
      // Zotero global unavailable — nothing more we can do
    }
    return undefined;
  }
}
