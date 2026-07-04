import { config } from "../package.json";
import {
  getStringPref,
  setPref,
  getBoolPref,
  getIntPref,
} from "./utils/prefs";
import { login } from "./modules/api";
import { syncAll } from "./modules/sync";

interface XULDoc {
  getElementById(id: string): HTMLElement | null;
  createXULElement(tag: string): HTMLElement;
  querySelectorAll(sel: string): NodeListOf<HTMLElement>;
}

class Hooks {
  private autoSyncTimer?: number;
  private mainWindow?: Window;
  private menuWindow?: Window;
  private menuElements: Element[] = [];

  async onStartup() {
    try {
      await Promise.all([
        Zotero.initializationPromise,
        Zotero.unlockPromise,
        Zotero.uiReadyPromise,
      ]);
      Zotero.debug(
        "[SonicNote Sync] onStartup done, attaching to main window",
      );
      // Proactively own the window: on some Zotero builds (e.g. Zotero 9) the
      // bootstrap onMainWindowLoad hook is not reliably fired, so we attach to
      // the already-open main window ourselves at the end of startup.
      const win = Zotero.getMainWindow() as unknown as Window | null;
      if (win) {
        await this.onMainWindowLoad(win);
      } else {
        Zotero.debug("[SonicNote Sync] main window not yet available");
      }
    } catch (e) {
      Zotero.debug(
        "[SonicNote Sync] onStartup error: " + ((e as Error)?.stack || e),
      );
    }
  }

  async onMainWindowLoad(win: Window) {
    Zotero.debug("[SonicNote Sync] onMainWindowLoad start");
    // Idempotent: bootstrap and our onStartup may both call this for the same
    // window. Skip if we already registered the menu on this exact window.
    if (this.menuWindow === win) {
      Zotero.debug("[SonicNote Sync] main window already handled, skip");
      return;
    }
    this.mainWindow = win;
    try {
      this.registerMenus(win);
      this.setupAutoSync();
      this.menuWindow = win;
      _globalThis.addon.data.initialized = true;
      Zotero.debug(
        "[SonicNote Sync] onMainWindowLoad done (initialized=true)",
      );
    } catch (e) {
      Zotero.debug(
        "[SonicNote Sync] onMainWindowLoad error: " +
          ((e as Error)?.stack || e),
      );
    }
  }

  async onMainWindowUnload(_win: Window) {
    this.unregisterMenus();
    this.menuWindow = undefined;
  }

  async onShutdown() {
    this.clearAutoSync();
    this.unregisterMenus();
    Zotero.debug("[SonicNote Sync] shutdown");
    _globalThis.addon.data.alive = false;
    delete (Zotero as unknown as Record<string, unknown>)[config.addonInstance];
    _globalThis.addon = undefined;
  }

  // ---------- Tools menu (native DOM, version-stable) ----------
  private registerMenus(win: Window) {
    const doc = win.document as unknown as XULDoc;
    // Try several known popup ids, then fall back to diagnostics.
    const candidates = [
      "menu_ToolsPopup",
      "menu_Tools-popup",
      "menu_Tools_menupopup",
    ];
    let popup: HTMLElement | null = null;
    let foundId = "";
    for (const id of candidates) {
      popup = doc.getElementById(id);
      if (popup) {
        foundId = id;
        break;
      }
    }
    if (!popup) {
      const ids = (
        Array.from(doc.querySelectorAll("[id]")) as HTMLElement[]
      )
        .map((e) => e.id)
        .filter((id) => /tool|menu|popup/i.test(id));
      Zotero.debug(
        "[SonicNote Sync] menu_ToolsPopup not found. Candidate ids: " +
          JSON.stringify(ids),
      );
      return;
    }
    Zotero.debug(`[SonicNote Sync] menu popup found: ${foundId}`);

    const sep = doc.createXULElement("menuseparator");
    const menu = doc.createXULElement("menu");
    menu.setAttribute("label", "SonicNote 妙记同步");
    const mp = doc.createXULElement("menupopup");

    const sync = doc.createXULElement("menuitem");
    sync.setAttribute("label", "同步录音到 Zotero");
    sync.addEventListener("command", () => {
      void this.runSync();
    });

    const settings = doc.createXULElement("menuitem");
    settings.setAttribute("label", "设置…");
    settings.addEventListener("command", () => {
      this.openSettings(win);
    });

    mp.appendChild(sync);
    mp.appendChild(settings);
    menu.appendChild(mp);
    popup.appendChild(sep);
    popup.appendChild(menu);

    this.menuElements.push(sep, menu);
  }

  private unregisterMenus() {
    for (const el of this.menuElements) {
      try {
        el.remove();
      } catch {
        // element may already be gone (window closed)
      }
    }
    this.menuElements = [];
  }

  // ---------- settings window ----------
  openSettings(win: Window) {
    win.openDialog(
      "chrome://sonicnotesync/content/preferences.xhtml",
      "sonicnote-settings",
      "chrome,modal,centerscreen,resizable=yes",
    );
  }

  onSettingsLoad(win: Window) {
    const doc = win.document;
    const $ = (id: string) => doc.getElementById(id) as HTMLInputElement;
    $("apiKey").value = getStringPref("apiKey");
    $("collectionName").value = getStringPref("collectionName") || "SonicNote";
    $("includeTranscript").checked = getBoolPref("includeTranscript");
    $("autoSyncIntervalMin").value = String(getIntPref("autoSyncIntervalMin"));
    $("serverUrl").value = getStringPref("serverUrl");
    const last = getStringPref("lastSyncTime");
    (doc.getElementById("lastSync") as HTMLElement).textContent = last
      ? `上次同步：${last}`
      : "";
    this.updateLoginStatus(win);
  }

  private updateLoginStatus(win: Window) {
    const el = win.document.getElementById("loginStatus") as HTMLElement;
    if (!el) return;
    const token = getStringPref("token");
    const apiKey = getStringPref("apiKey");
    if (token) {
      const masked = apiKey.length > 10 ? `${apiKey.slice(0, 10)}…` : apiKey;
      el.textContent = `✓ 已登录${apiKey ? `（${masked}）` : ""}`;
      el.style.color = "#2e7d32";
    } else {
      el.textContent = apiKey
        ? "未登录，点击「登录」验证 API Key"
        : "请填入 API Key 后点「登录」";
      el.style.color = "#666";
    }
  }

  private setLoginStatus(win: Window, text: string, isError: boolean) {
    const el = win.document.getElementById("loginStatus") as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#c62828" : "#2e7d32";
  }

  async onLoginClick(win: Window) {
    const doc = win.document;
    const apiKey = (doc.getElementById("apiKey") as HTMLInputElement).value.trim();
    if (!apiKey) {
      this.setLoginStatus(win, "请输入 API Key", true);
      return;
    }
    this.setLoginStatus(win, "登录中…", false);
    try {
      const res = await login(apiKey);
      if (res.ok) {
        setPref("apiKey", apiKey);
        this.setLoginStatus(win, "✓ 登录成功", false);
      } else {
        this.setLoginStatus(win, `✗ ${res.error || "登录失败"}`, true);
      }
    } catch (e: any) {
      this.setLoginStatus(win, `✗ ${e?.message || e}`, true);
    }
  }

  onSettingsAccept(win: Window) {
    const doc = win.document;
    const $ = (id: string) => doc.getElementById(id) as HTMLInputElement;
    setPref("apiKey", $("apiKey").value.trim());
    setPref("collectionName", $("collectionName").value.trim() || "SonicNote");
    setPref("includeTranscript", $("includeTranscript").checked);
    setPref(
      "autoSyncIntervalMin",
      parseInt($("autoSyncIntervalMin").value || "0", 10) || 0,
    );
    setPref("serverUrl", $("serverUrl").value.trim());
    this.setupAutoSync();
    win.close();
  }

  // ---------- sync ----------
  private async runSync() {
    const win = (this.mainWindow ||
      (Zotero.getMainWindow() as Window)) as Window;
    if (!getStringPref("token")) {
      // Not logged in → open settings so the user can log in first.
      this.openSettings(win);
      return;
    }
    const pw = new Zotero.ProgressWindow({ closeOnClick: true });
    pw.changeHeadline("SonicNote 妙记同步");
    pw.addDescription("正在同步…");
    pw.show();
    try {
      const stats = await syncAll({
        onProgress: (msg) => {
          pw.addDescription(msg);
        },
      });
      const errs = stats.errors.length ? `，失败 ${stats.failed}` : "";
      pw.addDescription(
        `完成：新增 ${stats.created}，更新 ${stats.updated}，跳过 ${stats.skipped}${errs}`,
      );
      pw.startCloseTimer(8000);
    } catch (e: any) {
      Zotero.logError?.(e as Error);
      pw.addDescription(`同步失败：${e?.message || e}`);
      pw.startCloseTimer(12000);
    }
  }

  // ---------- auto sync ----------
  private setupAutoSync() {
    this.clearAutoSync();
    const min = getIntPref("autoSyncIntervalMin");
    if (min > 0 && this.mainWindow) {
      const win = this.mainWindow as unknown as {
        setInterval: (fn: () => void, ms: number) => number;
      };
      this.autoSyncTimer = win.setInterval(() => {
        void this.runSync();
      }, min * 60 * 1000);
    }
  }

  private clearAutoSync() {
    if (this.autoSyncTimer !== undefined && this.mainWindow) {
      const win = this.mainWindow as unknown as {
        clearInterval: (id: number) => void;
      };
      win.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = undefined;
    }
  }
}

export default new Hooks();
