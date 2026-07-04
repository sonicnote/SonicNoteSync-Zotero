import { getStringPref, setPref, getBoolPref } from "../utils/prefs";
import {
  fetchRecordingList,
  fetchSummary,
  fetchTranscript,
  type RecordingListItem,
} from "./api";
import {
  ensureCollection,
  buildExistingIndex,
  createNote,
  updateNote,
} from "./zotero-writer";
import { mdToHtml, transcriptToHtml } from "./md-to-html";

export interface SyncProgress {
  onProgress?: (msg: string) => void;
}

export interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function syncAll(progress?: SyncProgress): Promise<SyncStats> {
  const stats: SyncStats = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const collectionName = getStringPref("collectionName") || "SonicNote";
  const includeTranscript = getBoolPref("includeTranscript");

  progress?.onProgress?.("准备收藏夹…");
  const collection = await ensureCollection(collectionName);

  progress?.onProgress?.("扫描已同步笔记…");
  const existing = await buildExistingIndex();

  progress?.onProgress?.("拉取录音列表…");
  const all: RecordingListItem[] = [];
  const size = 50;
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= 100) {
    const res = await fetchRecordingList(page, size);
    total = res.total;
    all.push(...res.list);
    if (res.list.length < size) break;
    page++;
  }

  progress?.onProgress?.(`共 ${all.length} 条录音，开始同步…`);

  for (const rec of all) {
    const audioId: string = rec.audioId;
    if (!audioId) continue;
    // delFlag '2' = deleted on server → skip
    if (rec.delFlag === "2") continue;
    const name = rec.recordNickName || rec.recordName || "未命名";
    try {
      const prev = existing.get(audioId);
      if (prev && prev.nick === name) {
        stats.skipped++;
        continue;
      }

      let bodyHtml = "";
      const summary = await fetchSummary(audioId);
      if (summary) bodyHtml += mdToHtml(summary);
      if (includeTranscript) {
        const segs = await fetchTranscript(audioId);
        if (segs && segs.length) {
          bodyHtml += `\n<h3>转写</h3>\n${transcriptToHtml(segs)}`;
        }
      }
      if (!bodyHtml.trim()) bodyHtml = "<p>（暂无 AI 总结）</p>";

      if (prev) {
        await updateNote(prev.item, name, bodyHtml, name);
        stats.updated++;
      } else {
        await createNote(name, bodyHtml, collection, audioId, name);
        stats.created++;
      }
      progress?.onProgress?.(`已同步：${name}`);
    } catch (e: any) {
      stats.failed++;
      stats.errors.push(`${name}(${audioId}): ${e?.message || e}`);
      Zotero.logError?.(e as Error);
    }
  }

  const now = new Date().toLocaleString("zh-CN");
  setPref("lastSyncTime", now);
  return stats;
}
