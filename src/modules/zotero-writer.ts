/**
 * Zotero write layer: create/update standalone note items, ensure the
 * dedicated collection, and build a dedup index keyed by audio id tag.
 */

const AUDIO_TAG_PREFIX = "sonicnote:audio_id:";
const NICK_TAG_PREFIX = "sonicnote:nick:";

function tagName(t: unknown): string {
  if (typeof t === "string") return t;
  return (t as { tag?: string })?.tag ?? "";
}

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

export function wrapNoteHtml(title: string, bodyHtml: string): string {
  // <h1> at the very top → Zotero uses it as the note's list label.
  return `<h1>${escapeHtml(title)}</h1>\n${bodyHtml}`;
}

export async function ensureCollection(name: string): Promise<Zotero.Collection> {
  const libID = Zotero.Libraries.userLibraryID;
  const existing = (Zotero.Collections.getByLibrary(libID) as Zotero.Collection[])
    .filter((c) => !c.deleted);
  const found = existing.find((c) => c.name === name);
  if (found) return found;
  const col = new Zotero.Collection();
  col.name = name;
  // libraryID is a runtime-settable property; zotero-types marks it readonly.
  (col as unknown as { libraryID: number }).libraryID = libID;
  await col.saveTx();
  return col;
}

export interface ExistingEntry {
  item: Zotero.Item;
  nick: string;
}

export async function buildExistingIndex(): Promise<
  Map<string, ExistingEntry>
> {
  const index = new Map<string, ExistingEntry>();
  const libID = Zotero.Libraries.userLibraryID;
  const items = (await Zotero.Items.getAll(libID)) as Zotero.Item[];
  for (const item of items) {
    if (!item.isNote || !item.isNote()) continue;
    if (item.deleted) continue;
    const tags = (item.getTags ? item.getTags() : []) as unknown[];
    let audioId = "";
    let nick = "";
    for (const t of tags) {
      const name = tagName(t);
      if (name.startsWith(AUDIO_TAG_PREFIX)) {
        audioId = name.slice(AUDIO_TAG_PREFIX.length);
      } else if (name.startsWith(NICK_TAG_PREFIX)) {
        nick = name.slice(NICK_TAG_PREFIX.length);
      }
    }
    if (audioId) index.set(audioId, { item, nick });
  }
  return index;
}

export async function createNote(
  title: string,
  bodyHtml: string,
  collection: Zotero.Collection | undefined,
  audioId: string,
  nick: string,
): Promise<Zotero.Item> {
  const note = new Zotero.Item("note");
  // libraryID is a runtime-settable property; zotero-types marks it readonly.
  (note as unknown as { libraryID: number }).libraryID =
    Zotero.Libraries.userLibraryID;
  note.setNote(wrapNoteHtml(title, bodyHtml));
  await note.saveTx();
  if (collection?.id) note.addToCollection(collection.id);
  note.addTag(AUDIO_TAG_PREFIX + audioId);
  note.addTag(NICK_TAG_PREFIX + nick);
  await note.saveTx();
  return note;
}

export async function updateNote(
  item: Zotero.Item,
  title: string,
  bodyHtml: string,
  nick: string,
): Promise<void> {
  item.setNote(wrapNoteHtml(title, bodyHtml));
  const tags = (item.getTags ? item.getTags() : []) as unknown[];
  for (const t of tags) {
    const name = tagName(t);
    if (name.startsWith(NICK_TAG_PREFIX)) {
      item.removeTag(name);
    }
  }
  item.addTag(NICK_TAG_PREFIX + nick);
  await item.saveTx();
}
