/**
 * Lightweight Markdown → HTML converter (no dependencies).
 * Covers the subset SonicNote summaries actually use: ATX headings,
 * ordered/unordered lists, fenced code blocks, bold/italic, inline code,
 * links, and blank-line separated paragraphs.
 *
 * Zotero notes render a restricted HTML subset, so the output stays simple.
 */

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

function inline(s: string): string {
  // Escape first, then re-apply inline markup. Markdown marker chars
  // (* ` [ ] ( ) ) are not HTML-special, so they survive escaping untouched.
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>',
  );
  return out;
}

export function mdToHtml(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const raw of lines) {
    const line = raw;

    if (/^```/.test(line.trim())) {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        closeLists();
        html.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      html.push("\n");
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const lvl = h[1].length;
      html.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      continue;
    }

    closeLists();
    html.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) html.push("</code></pre>");
  closeLists();
  return html.join("\n");
}

export function transcriptToHtml(
  segs: { spokesperson?: string; time?: string; text?: string }[],
): string {
  if (!segs || !segs.length) return "";
  const out = ["<ul>"];
  for (const s of segs) {
    const sp = escapeHtml(String(s.spokesperson || "未知"));
    const time = escapeHtml(String(s.time || ""));
    const text = inline(String(s.text || ""));
    out.push(`<li><strong>[${time}] ${sp}：</strong> ${text}</li>`);
  }
  out.push("</ul>");
  return out.join("\n");
}
