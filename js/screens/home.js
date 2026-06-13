// 記錄首頁：開始新訓練 + 月曆（有訓練的日子打勾，點進去看當天紀錄）。
import * as db from '../db.js';
import { el, navigate } from '../ui.js';
import { today } from '../state.js';

const pad = (n) => String(n).padStart(2, '0');

export default async function home() {
  const [sessions, templates] = await Promise.all([db.getAll('sessions'), db.getAll('templates')]);
  const tplById = new Map(templates.map((t) => [t.id, t]));

  // 日期 -> 當天的訓練
  const byDate = new Map();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  const now = today();
  const curMonth = now.slice(0, 7);

  // 月份範圍：最早一筆訓練的月份 → 本月（連續，可上下捲動）
  const sortedDates = sessions.map((s) => s.date).sort();
  const months = [];
  {
    let [y, m] = (sortedDates[0] || now).slice(0, 7).split('-').map(Number); // m 1-based
    const [ey, em] = curMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push({ y, m });
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  const screen = el('div', { class: 'screen' });
  const monthLabel = el('div', { class: 'cal-title' }, ['']);
  screen.append(el('div', { class: 'sticky-head' }, [
    el('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => startFlow(templates) }, ['＋ 開始新訓練']),
    monthLabel,
    el('div', { class: 'cal-grid' }, ['日', '一', '二', '三', '四', '五', '六'].map((d) => el('div', { class: 'cal-dowcell' }, [d]))),
  ]));

  const monthsWrap = el('div', { class: 'cal-months' });
  for (const { y, m } of months) monthsWrap.append(renderMonth(y, m));
  screen.append(monthsWrap);
  const spacer = el('div', { class: 'cal-spacer' }); // 讓最後一個月也能捲到頂（高度動態設定）
  screen.append(spacer);

  // 懸浮「本月」鈕（浮在底部導覽列上方；已在本月時自動隱藏）
  const fab = el('button', { class: 'fab-today hidden', onclick: () => scrollToCurrent(true) }, ['本月']);
  screen.append(fab);

  // 月份標籤隨捲動更新；離開畫面時自動解除監聽。
  const stickyHead = screen.querySelector('.sticky-head');
  function updateLabel() {
    if (!document.body.contains(monthLabel)) { window.removeEventListener('scroll', onScroll); return; }
    const ty = stickyHead.getBoundingClientRect().bottom;
    let cur = monthsWrap.lastElementChild;
    for (const b of monthsWrap.children) { // 取底部仍在標籤列下方的第一個月份
      if (b.getBoundingClientRect().bottom > ty + 8) { cur = b; break; }
    }
    if (cur) monthLabel.textContent = `${cur.dataset.y} 年 ${Number(cur.dataset.m)} 月`;
    fab.classList.toggle('hidden', cur?.dataset.cur === '1'); // 已在本月就隱藏
  }
  let scheduled = false;
  function onScroll() { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; updateLabel(); }); }
  window.addEventListener('scroll', onScroll, { passive: true });

  function scrollToCurrent(smooth) {
    const curEl = monthsWrap.querySelector('[data-cur="1"]') || monthsWrap.lastElementChild;
    if (!curEl) return;
    const top = Math.max(0, curEl.getBoundingClientRect().top + window.scrollY - stickyHead.getBoundingClientRect().bottom);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    updateLabel();
  }

  // 開啟時捲到「本月」：等月曆尺寸確定後再量測捲動（ResizeObserver 首次回呼）
  const ro = new ResizeObserver(() => {
    ro.disconnect();
    if (!document.body.contains(monthLabel)) return;
    // 底部留白：剛好讓最後一個月能捲到頂端，不多留
    const lastH = monthsWrap.lastElementChild ? monthsWrap.lastElementChild.getBoundingClientRect().height : 0;
    const avail = window.innerHeight - stickyHead.getBoundingClientRect().bottom;
    spacer.style.height = Math.max(0, avail - lastH - 12) + 'px';
    scrollToCurrent(false);
  });
  ro.observe(monthsWrap);

  return screen;

  function renderMonth(y, m) {
    const startDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(el('div', { class: 'cal-cell empty' }));
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${pad(m)}-${pad(d)}`;
      const day = byDate.get(dateStr) || [];
      const has = day.length > 0;
      const draftOnly = has && day.every((s) => s.committed === false);
      const cell = el('div', { class: 'cal-cell' + (has ? ' has' : '') + (dateStr === now ? ' today' : '') + (draftOnly ? ' draft' : '') }, [
        el('div', { class: 'cal-day' }, [String(d)]),
        has ? el('div', { class: 'cal-mark' }, [draftOnly ? '•' : '✓']) : null,
      ]);
      if (has) cell.onclick = () => openDay(dateStr, day);
      cells.push(cell);
    }
    const block = el('div', { class: 'cal-month' }, [el('div', { class: 'cal-grid' }, cells)]);
    block.dataset.y = y; block.dataset.m = m;
    if (`${y}-${pad(m)}` === curMonth) block.dataset.cur = '1';
    return block;
  }

  function openDay(dateStr, day) {
    if (day.length === 1) { navigate('#/session/' + day[0].id); return; }
    const close = () => overlay.remove();
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
      el('div', { class: 'modal' }, [
        el('div', { class: 'modal-body stack' }, [
          el('div', { style: 'font-weight:700' }, [dateStr]),
          ...day.map((s) => {
            const tpl = s.templateId ? tplById.get(s.templateId) : null;
            const name = (tpl ? tpl.name : s.note) || '訓練';
            return el('button', { class: 'btn btn-block', onclick: () => { close(); navigate('#/session/' + s.id); } },
              [name + (s.committed === false ? '（進行中）' : '')]);
          }),
        ]),
        el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-ghost', onclick: close }, ['關閉'])]),
      ]),
    ]);
    document.body.append(overlay);
  }
}

// 選範本 → 建立 session → 進入記錄畫面。
function startFlow(templates) {
  const close = () => overlay.remove();
  const start = async (templateId) => {
    const session = {
      id: db.uid(), date: today(), templateId: templateId || null, note: '', createdAt: Date.now(),
      committed: false, // 尚未按「完成」前是草稿
    };
    await db.put('sessions', session);
    close();
    navigate('#/session/' + session.id);
  };

  const list = el('div', { class: 'stack' }, [
    el('button', { class: 'btn btn-block', onclick: () => start(null) }, ['空白開始（臨時加動作）']),
    ...templates.map((t) =>
      el('button', { class: 'btn btn-block btn-primary', onclick: () => start(t.id) },
        [`套用範本：${t.name}`])
    ),
  ]);

  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal' }, [
      el('div', { class: 'modal-body' }, [
        el('div', { style: 'font-weight:700;margin-bottom:12px' }, ['開始訓練']),
        templates.length ? list : el('div', {}, [
          el('div', { class: 'small muted', style: 'margin-bottom:12px' }, ['還沒有範本，可先空白開始']),
          el('button', { class: 'btn btn-primary btn-block', onclick: () => start(null) }, ['空白開始']),
        ]),
      ]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-ghost', onclick: close }, ['取消']),
      ]),
    ]),
  ]);
  document.body.append(overlay);
}
