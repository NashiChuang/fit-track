// 設定：備份（匯出/匯入 JSON）、步進設定、清空資料。
import * as db from '../db.js';
import { el, toast, confirmDialog, render } from '../ui.js';
import { getSettings, setSetting, today } from '../state.js';
import { parseCsv, toCsv } from '../csv.js';

const normName = (n) => String(n).replace(/\s*\(([^)]*)\)/g, '（$1）'); // 半形括號→全形

export default async function settings() {
  const s = getSettings();
  const screen = el('div', { class: 'screen' });

  // ---- 備份 ----
  screen.append(el('h2', { class: 'section' }, ['備份（保命繩）']));
  screen.append(el('div', { class: 'card stack' }, [
    el('div', { class: 'small muted' }, ['資料只存在這支手機的瀏覽器裡，清快取/換機可能消失。養成定期「匯出 JSON」存到雲端硬碟的習慣。']),
    el('button', { class: 'btn btn-primary btn-block', onclick: exportJson }, ['⬇️ 匯出 JSON 備份']),
    el('button', { class: 'btn btn-block', onclick: importJson }, ['⬆️ 匯入 JSON 還原（覆蓋）']),
    el('button', { class: 'btn btn-block', onclick: mergeJson }, ['➕ 合併匯入 JSON（加進現有）']),
    el('div', { class: 'tiny muted', style: 'margin-top:4px' }, ['JSON＝完整備份（含動作庫/範本/紀錄）。CSV＝訓練紀錄，方便用試算表看；匯入 CSV 只覆蓋紀錄，動作庫與範本保留。']),
    el('button', { class: 'btn btn-block', onclick: exportCsv }, ['⬇️ 匯出 CSV（試算表）']),
    el('button', { class: 'btn btn-block', onclick: importCsv }, ['⬆️ 匯入 CSV']),
  ]));

  // ---- 輸入設定 ----
  screen.append(el('h2', { class: 'section' }, ['輸入設定']));
  screen.append(el('div', { class: 'card stack' }, [
    el('label', { class: 'row between' }, [
      el('span', {}, ['次數步進']),
      el('input', { type: 'number', step: '1', min: '1', value: String(s.repStep), style: 'width:100px',
        onchange: (e) => { setSetting('repStep', parseInt(e.target.value) || 1); toast('已更新'); } }),
    ]),
  ]));

  // ---- 報表設定 ----
  screen.append(el('h2', { class: 'section' }, ['報表設定']));
  screen.append(el('div', { class: 'card stack' }, [
    el('label', { class: 'row between' }, [
      el('span', {}, ['趨勢平均線範圍（次/日）']),
      el('input', { type: 'number', step: '1', min: '2', max: '20', value: String(s.avgWindow), style: 'width:100px',
        onchange: (e) => { setSetting('avgWindow', Math.max(2, parseInt(e.target.value) || 4)); toast('已更新'); } }),
    ]),
    el('div', { class: 'tiny muted' }, ['報表單線圖會多畫一條「過去 N 次/日平均」，看長期是否在成長。']),
  ]));

  // ---- 危險區 ----
  screen.append(el('h2', { class: 'section' }, ['危險區']));
  screen.append(el('div', { class: 'card stack' }, [
    el('button', { class: 'btn btn-danger btn-block', onclick: wipe }, ['🗑️ 清空所有資料']),
  ]));

  screen.append(el('div', { class: 'tiny muted', style: 'text-align:center;padding:12px' }, ['負荷漸進追蹤 · local-first PWA']));
  return screen;

  async function exportJson() {
    const payload = await db.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `fit-track-backup-${today()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已匯出');
  }

  function importJson() {
    const input = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const ok = await confirmDialog('匯入會「覆蓋」目前所有資料，確定嗎？（建議先匯出目前資料）', { danger: true, okText: '覆蓋匯入' });
        if (!ok) return;
        await db.importAll(payload, 'replace');
        toast('已還原'); render();
      } catch (e) {
        toast('匯入失敗：' + (e.message || e));
      }
    };
    document.body.append(input); input.click(); input.remove();
  }

  function mergeJson() {
    const input = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const d = payload.data || {};
        const ok = await confirmDialog(`合併匯入：加入 ${d.sessions?.length || 0} 次訓練、${d.exercises?.length || 0} 個新動作；現有資料保留。確定？`, { okText: '合併匯入' });
        if (!ok) return;
        await db.importAll(payload, 'merge');
        toast('已合併匯入'); render();
      } catch (e) {
        toast('此檔無法使用');
      }
    };
    document.body.append(input); input.click(); input.remove();
  }

  async function wipe() {
    const ok = await confirmDialog('清空所有動作、範本、訓練紀錄？此動作無法復原。', { danger: true, okText: '全部清空' });
    if (!ok) return;
    await db.wipeAll();
    toast('已清空'); render();
  }

  function download(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- CSV 匯出：每組一列（日期/課表/動作/組/重量/次數/熱身/完成）----
  async function exportCsv() {
    const [sessions, exercises, allSets, templates] = await Promise.all([
      db.getAll('sessions'), db.getAll('exercises'), db.getAll('sets'), db.getAll('templates'),
    ]);
    const exById = new Map(exercises.map((e) => [e.id, e]));
    const tplById = new Map(templates.map((t) => [t.id, t]));
    const bySession = new Map();
    for (const x of allSets) { if (!bySession.has(x.sessionId)) bySession.set(x.sessionId, []); bySession.get(x.sessionId).push(x); }
    sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt - b.createdAt));

    const rows = [['日期', '課表', '動作', '組', '重量', '次數', '熱身', '完成']];
    for (const sess of sessions) {
      const name = (sess.templateId ? tplById.get(sess.templateId)?.name : null) || sess.note || '';
      const sets = bySession.get(sess.id) || [];
      const order = (sess.exerciseIds && sess.exerciseIds.length) ? sess.exerciseIds : [...new Set(sets.map((x) => x.exerciseId))];
      for (const exId of order) {
        const exName = exById.get(exId)?.name || '（已刪除）';
        sets.filter((x) => x.exerciseId === exId).sort((a, b) => a.setOrder - b.setOrder)
          .forEach((x, i) => rows.push([sess.date, name, exName, i + 1, x.weight, x.reps, x.isWarmup ? 1 : 0, x.done !== false ? 1 : 0]));
      }
    }
    download(toCsv(rows), `fit-track-${today()}.csv`, 'text/csv;charset=utf-8');
    toast('已匯出 CSV');
  }

  // ---- CSV 匯入：支援本 App 格式與 FitFit/Strong 格式；不符就提示無法使用 ----
  function importCsv() {
    const input = el('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      let built;
      try {
        built = await buildFromCsv(parseCsv(await file.text()));
      } catch (e) {
        toast('此 CSV 無法使用'); return;
      }
      const ok = await confirmDialog(`匯入會覆蓋現有訓練紀錄（${built.sessions.length} 次、${built.sets.length} 組）；動作庫與範本保留。確定？`, { danger: true, okText: '覆蓋匯入' });
      if (!ok) return;
      await db.replaceLog(built);
      toast('CSV 匯入完成'); render();
    };
    document.body.append(input); input.click(); input.remove();
  }

  async function buildFromCsv(rows) {
    if (!rows.length) throw new Error('empty');
    const H = rows[0].map((h) => String(h).trim());
    const idx = (names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
    const iDate = idx(['日期', 'Date']);
    const iWk = idx(['課表', 'Workout Name', 'Workout']);
    const iEx = idx(['動作', 'Exercise Name', 'Exercise']);
    const iW = idx(['重量', 'Weight']);
    const iR = idx(['次數', 'Reps']);
    const iWarm = idx(['熱身']);
    const iDone = idx(['完成']);
    if (iDate < 0 || iEx < 0 || iR < 0) throw new Error('unknown format');

    const existing = await db.getAll('exercises');
    const byName = new Map(existing.map((e) => [e.name, e]));
    const newExercises = [];
    const resolveEx = (raw) => {
      const name = normName(String(raw || '').trim());
      if (!name) return null;
      let e = byName.get(name);
      if (!e) { e = { id: db.uid(), name, muscles: [], createdAt: Date.now() }; byName.set(name, e); newExercises.push(e); }
      return e;
    };

    const sessionMap = new Map();
    const orderCount = new Map();
    const sets = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const date = String(row[iDate] || '').trim();
      const ex = resolveEx(row[iEx]);
      const reps = parseFloat(row[iR]);
      if (!date || !ex || !Number.isFinite(reps) || reps <= 0) continue;
      const weight = iW >= 0 ? (parseFloat(row[iW]) || 0) : 0;
      const workout = iWk >= 0 ? String(row[iWk] || '').trim() : '';
      const key = date + '|' + workout;
      let sess = sessionMap.get(key);
      if (!sess) { sess = { id: db.uid(), date, templateId: null, note: workout, committed: true, exerciseIds: [], createdAt: Date.now() + sessionMap.size }; sessionMap.set(key, sess); }
      if (!sess.exerciseIds.includes(ex.id)) sess.exerciseIds.push(ex.id);
      const oKey = sess.id + '|' + ex.id;
      const so = orderCount.get(oKey) || 0; orderCount.set(oKey, so + 1);
      const warm = iWarm >= 0 && /^(1|是|true|y)/i.test(String(row[iWarm] || '').trim());
      const done = !(iDone >= 0 && /^(0|否|false|n)/i.test(String(row[iDone] || '').trim()));
      sets.push({ id: db.uid(), sessionId: sess.id, exerciseId: ex.id, setOrder: so, weight, reps, isWarmup: warm, done });
    }
    const sessions = [...sessionMap.values()];
    if (!sessions.length || !sets.length) throw new Error('no data');
    return { newExercises, sessions, sets };
  }
}
