// 設定：備份（匯出/匯入 JSON）、步進設定、清空資料。
import * as db from '../db.js';
import { el, toast, confirmDialog, render } from '../ui.js';
import { getSettings, setSetting, today } from '../state.js';

export default async function settings() {
  const s = getSettings();
  const screen = el('div', { class: 'screen' });

  // ---- 備份 ----
  screen.append(el('h2', { class: 'section' }, ['備份（保命繩）']));
  screen.append(el('div', { class: 'card stack' }, [
    el('div', { class: 'small muted' }, ['資料只存在這支手機的瀏覽器裡，清快取/換機可能消失。養成定期「匯出 JSON」存到雲端硬碟的習慣。']),
    el('button', { class: 'btn btn-primary btn-block', onclick: exportJson }, ['⬇️ 匯出 JSON 備份']),
    el('button', { class: 'btn btn-block', onclick: importJson }, ['⬆️ 匯入 JSON 還原']),
  ]));

  // ---- 輸入設定 ----
  screen.append(el('h2', { class: 'section' }, ['輸入設定']));
  screen.append(el('div', { class: 'card stack' }, [
    el('label', { class: 'row between' }, [
      el('span', {}, ['重量步進 (kg)']),
      el('input', { type: 'number', step: '0.5', min: '0.5', value: String(s.weightStep), style: 'width:100px',
        onchange: (e) => { setSetting('weightStep', parseFloat(e.target.value) || 2.5); toast('已更新'); } }),
    ]),
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

  async function wipe() {
    const ok = await confirmDialog('清空所有動作、範本、訓練紀錄？此動作無法復原。', { danger: true, okText: '全部清空' });
    if (!ok) return;
    await db.wipeAll();
    toast('已清空'); render();
  }
}
