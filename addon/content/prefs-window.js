/*
 * SonicNote Sync — settings window controller.
 * Loaded into the standalone settings chrome window via <script src>.
 * We avoid inline onload/onclick (blocked by CSP in Zotero 9 chrome windows)
 * and bind handlers here with addEventListener.
 */
(function () {
  "use strict";

  function init() {
    // Zotero global is available in chrome windows; fall back to opener.
    var Z =
      typeof Zotero !== "undefined"
        ? Zotero
        : window.opener && window.opener.Zotero;
    if (!Z || !Z.SonicNoteSync || !Z.SonicNoteSync.hooks) {
      if (Z && Z.debug)
        Z.debug(
          "[SonicNote Sync] prefs-window: Zotero.SonicNoteSync not available",
        );
      return;
    }
    Z.debug("[SonicNote Sync] prefs-window: binding handlers");

    // Force a window size large enough to show the API Key row + login button.
    // CSS width on <window> doesn't set the OS window size in Firefox 115+.
    try {
      window.sizeToContent();
    } catch (e) {}
    try {
      var w = Math.max(window.outerWidth, 700);
      var h = Math.max(window.outerHeight, 600);
      window.resizeTo(w, h);
    } catch (e) {}

    var hooks = Z.SonicNoteSync.hooks;
    var doc = document;

    function bind(id, evt, fn) {
      var el = doc.getElementById(id);
      if (el) el.addEventListener(evt, fn);
      else Z.debug("[SonicNote Sync] prefs-window: element not found: " + id);
    }

    // Populate fields + login status.
    try {
      hooks.onSettingsLoad(window);
    } catch (e) {
      Z.debug("[SonicNote Sync] onSettingsLoad error: " + (e && e.stack));
    }

    bind("loginBtn", "click", function () {
      void hooks.onLoginClick(window);
    });
    bind("saveBtn", "click", function () {
      hooks.onSettingsAccept(window);
    });
    bind("cancelBtn", "click", function () {
      window.close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
