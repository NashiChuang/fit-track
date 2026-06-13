// 報表：維度切換器（單動作 / 肌群 / 彙總），對應「強度」與「訓練量分配」兩個問題。
import * as db from '../db.js';
import { el, fmtNum } from '../ui.js';
import { getSettings, setSetting, MUSCLES } from '../state.js';
import { exerciseTrend, muscleDailyTrend } from '../metrics.js';

// 單動作指標（重量可比，看強度）
const METRICS = {
  topWeight:   { label: '最重組重量', get: (p) => p.topWeight },
  topReps:     { label: '頂組次數',   get: (p) => p.topReps },
  totalVolume: { label: '總容量',     get: (p) => p.totalVolume },
  avgWeight:   { label: '平均重量',   get: (p) => p.avgWeight },
  totalReps:   { label: '總次數',     get: (p) => p.totalReps },
  dualTop:     { label: '頂組雙線',   dual: true },
};
// 肌群指標（重量不可比，只看可加總的量）
const MUSCLE_METRICS = {
  volume: { label: '總容量', get: (o) => o.volume },
  reps:   { label: '總次數', get: (o) => o.reps },
};
const MUSCLE_COLORS = { 胸: '#5b8cff', 背: '#34d399', 肩: '#f5a623', 二頭: '#e879f9', 三頭: '#22d3ee', 腿臀: '#fb7185' };
const GRID = '#2c313c', TICK = '#9aa3b2';

export default async function report() {
  const [exList, allSessions, allSets] = await Promise.all([
    db.getAll('exercises'), db.getAll('sessions'), db.getAll('sets'),
  ]);
  exList.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const sessionsById = new Map(allSessions.map((s) => [s.id, s]));
  const exercisesById = new Map(exList.map((e) => [e.id, e]));
  const settings = getSettings();

  const screen = el('div', { class: 'screen' });
  if (!exList.length) {
    screen.append(el('div', { class: 'empty' }, [
      el('div', { class: 'big' }, ['📈']), el('div', {}, ['還沒有資料']),
      el('div', { class: 'small muted' }, ['先建立動作並記錄幾次訓練，這裡就會畫出趨勢']),
    ]));
    return screen;
  }

  const DIMS = ['exercise', 'muscle'];
  let dim = DIMS.includes(settings.lastDim) ? settings.lastDim : 'exercise';

  // 統一管理圖表實例，切維度時一次銷毀，避免累積
  const liveCharts = [];
  const mkChart = (ctx, config) => { const c = new window.Chart(ctx, config); liveCharts.push(c); return c; };

  const tabs = el('div', { class: 'tabs' }, [
    el('button', { onclick: () => switchDim('exercise') }, ['單動作']),
    el('button', { onclick: () => switchDim('muscle') }, ['肌群']),
  ]);
  const body = el('div', { class: 'stack' });
  screen.append(el('div', { class: 'sticky-head' }, [tabs]), body);

  function switchDim(d) {
    // 切維度前銷毀所有圖表，避免 Chart 實例累積
    while (liveCharts.length) { try { liveCharts.pop().destroy(); } catch (e) { /* 已銷毀 */ } }
    dim = d; setSetting('lastDim', d);
    DIMS.forEach((x, i) => tabs.children[i].classList.toggle('on', x === d));
    body.replaceChildren(dim === 'exercise' ? exerciseView() : muscleView());
  }
  switchDim(dim);
  return screen;

  // ============================================================
  // 單動作（強度）
  // ============================================================
  function exerciseView() {
    const root = el('div', { class: 'stack' });
    let exId = exList.find((e) => e.id === settings.lastExercise)?.id || exList[0].id;
    let metric = METRICS[settings.lastMetric] ? settings.lastMetric : 'topWeight';
    let part = null;
    let chart = null;

    const hasMuscle = (ex, m) => (ex.muscles || []).some((x) => x.muscle === m);
    const counts = Object.fromEntries(MUSCLES.map((m) => [m, exList.filter((e) => hasMuscle(e, m)).length]));
    const filteredEx = () => (part ? exList.filter((e) => hasMuscle(e, part)) : exList);

    const partBar = el('div', { class: 'chips filter-bar' });
    const exSelect = el('select', { onchange: (e) => { exId = e.target.value; setSetting('lastExercise', exId); redraw(); } });
    const switchWrap = el('div', { class: 'metric-switch' }, Object.entries(METRICS).map(([key, m]) =>
      el('button', { class: 'btn btn-sm', onclick: () => { metric = key; setSetting('lastMetric', key); redraw(); } }, [m.label])));
    const stats = el('div', { class: 'stat-grid' });
    const density = el('div', { class: 'tiny muted' });
    const chartWrap = el('div', { class: 'chart-wrap' }, [el('canvas', {})]);

    function renderControls() {
      const mkChip = (label, n, on, val) =>
        el('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { part = val; onPart(); } },
          [label, el('span', { class: 'chip-n' }, [String(n)])]);
      partBar.replaceChildren(mkChip('全部', exList.length, part === null, null),
        ...MUSCLES.map((m) => mkChip(m, counts[m], part === m, m)));
      exSelect.replaceChildren(...filteredEx().map((ex) =>
        el('option', { value: ex.id, ...(ex.id === exId ? { selected: 'selected' } : {}) }, [ex.name])));
    }
    function onPart() {
      const opts = filteredEx();
      if (!opts.some((e) => e.id === exId)) { exId = opts[0]?.id; if (exId) setSetting('lastExercise', exId); }
      renderControls(); redraw();
    }

    root.append(
      el('div', { class: 'card stack' }, [el('div', { class: 'tiny muted' }, ['先選部位，再選動作']), partBar,
        el('label', { class: 'field' }, [el('span', {}, ['動作']), exSelect])]),
      el('div', { class: 'card stack' }, [switchWrap, el('div', { class: 'tiny muted' }, ['只計算正式組，熱身組一律排除'])]),
      stats, density,
      el('div', { class: 'card' }, [chartWrap]),
    );
    renderControls();
    queueMicrotask(redraw); // 等 root 掛上畫面後再畫，避免被 isConnected 防孤兒擋掉
    return root;

    async function redraw() {
      [...switchWrap.children].forEach((b, i) => b.classList.toggle('btn-primary', Object.keys(METRICS)[i] === metric));
      if (!exId) { stats.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, ['這個部位還沒有動作'])); density.replaceChildren(); return; }
      const rows = await db.setsByExercise(exId);
      const trend = exerciseTrend(rows, sessionsById, { includeWarmup: false });
      const m = METRICS[metric];

      if (!trend.length) {
        stats.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, ['這個動作還沒有紀錄']));
      } else {
        const pr = Math.max(...trend.map((p) => p.topWeight).filter((v) => v != null));
        const latest = trend[trend.length - 1];
        stats.replaceChildren(
          stat('最新最重組', latest.topWeight != null ? `${fmtNum(latest.topWeight)}kg × ${latest.topReps}` : '–'),
          stat('最佳 (PR)', isFinite(pr) ? `${fmtNum(pr)}kg` : '–'),
          stat('訓練次數', String(trend.length)),
          stat('最近日期', latest.date),
        );
      }
      // 資料密度：找出 >21 天的斷檔，不硬連成誤導趨勢
      const gaps = [];
      for (let i = 1; i < trend.length; i++) {
        const d = (new Date(trend[i].date) - new Date(trend[i - 1].date)) / 86400000;
        if (d > 21) gaps.push(`${trend[i - 1].date} → ${trend[i].date}（${Math.round(d)} 天）`);
      }
      density.replaceChildren(gaps.length ? document.createTextNode('⚠️ 期間有斷檔：' + gaps.join('、') + '；趨勢線跨斷檔僅供參考') : document.createTextNode(''));

      drawChart(trend, m);
    }

    function drawChart(trend, m) {
      if (chart) { chart.destroy(); chart = null; }
      if (!window.Chart) { chartWrap.replaceChildren(el('div', { class: 'small muted' }, ['圖表元件載入中…'])); return; }
      if (!chartWrap.isConnected) return; // 視圖已被切走（非同步重繪），不要產生孤兒圖表
      if (!chartWrap.querySelector('canvas')) chartWrap.replaceChildren(el('canvas', {}));
      const labels = trend.map((p) => p.date.slice(5));
      const datasets = m.dual
        ? [{ label: '頂組重量(kg)', data: trend.map((p) => p.topWeight), borderColor: '#5b8cff', backgroundColor: '#5b8cff', yAxisID: 'y', tension: .25 },
           { label: '頂組次數', data: trend.map((p) => p.topReps), borderColor: '#34d399', backgroundColor: '#34d399', yAxisID: 'y1', tension: .25 }]
        : [{ label: m.label, data: trend.map((p) => m.get(p)), borderColor: '#5b8cff', backgroundColor: '#5b8cff', tension: .25 }];
      chart = mkChart(chartWrap.querySelector('canvas').getContext('2d'), {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: TICK } } },
          scales: { x: { ticks: { color: TICK }, grid: { color: GRID } }, y: { position: 'left', ticks: { color: TICK }, grid: { color: GRID } },
            ...(m.dual ? { y1: { position: 'right', ticks: { color: '#34d399' }, grid: { drawOnChartArea: false } } } : {}) },
        },
      });
    }
  }

  // ============================================================
  // 肌群（訓練量分配）
  // ============================================================
  function muscleView() {
    const root = el('div', { class: 'stack' });
    let muscle = MUSCLES.includes(settings.lastMuscle) ? settings.lastMuscle : MUSCLES[0];
    let mMetric = MUSCLE_METRICS[settings.lastMuscleMetric] ? settings.lastMuscleMetric : 'volume';
    let chart = null;

    const muscleSelect = el('select', { onchange: (e) => { muscle = e.target.value; setSetting('lastMuscle', muscle); redraw(); } },
      MUSCLES.map((m) => el('option', { value: m, ...(m === muscle ? { selected: 'selected' } : {}) }, [m])));
    const switchWrap = el('div', { class: 'metric-switch' }, Object.entries(MUSCLE_METRICS).map(([k, m]) =>
      el('button', { class: 'btn btn-sm', onclick: () => { mMetric = k; setSetting('lastMuscleMetric', k); redraw(); } }, [m.label])));
    const stats = el('div', { class: 'stat-grid' });
    const density = el('div', { class: 'tiny muted' });
    const chartWrap = el('div', { class: 'chart-wrap' }, [el('canvas', {})]);
    const detail = el('div', { class: 'stack' });

    root.append(
      el('label', { class: 'field' }, [el('span', {}, ['肌群']), muscleSelect]),
      el('div', { class: 'card stack' }, [switchWrap, el('div', { class: 'tiny muted' }, ['以「日」為單位的訓練量；只計算正式組，熱身組一律排除'])]),
      stats, density,
      el('div', { class: 'card' }, [chartWrap]),
      el('h2', { class: 'section' }, ['單日明細']),
      detail,
    );
    queueMicrotask(redraw); // 等 root 掛上畫面後再畫，避免被 isConnected 防孤兒擋掉
    return root;

    function redraw() {
      [...switchWrap.children].forEach((b, i) => b.classList.toggle('btn-primary', Object.keys(MUSCLE_METRICS)[i] === mMetric));
      const trend = muscleDailyTrend(allSets, exercisesById, sessionsById, muscle);
      const m = MUSCLE_METRICS[mMetric];

      if (!trend.length) {
        stats.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, ['這個肌群還沒有紀錄']));
        detail.replaceChildren(); density.replaceChildren();
        if (chart) { chart.destroy(); chart = null; }
        return;
      }
      const vals = trend.map((p) => m.get(p));
      const latest = trend[trend.length - 1];
      const unit = mMetric === 'reps' ? ' 下' : '';
      stats.replaceChildren(
        stat('最新一天', Math.round(m.get(latest)) + unit),
        stat('最高', Math.round(Math.max(...vals)) + unit),
        stat('訓練天數', String(trend.length)),
        stat('最近日期', latest.date),
      );

      const gaps = [];
      for (let i = 1; i < trend.length; i++) {
        const d = (new Date(trend[i].date) - new Date(trend[i - 1].date)) / 86400000;
        if (d > 21) gaps.push(`${trend[i - 1].date} → ${trend[i].date}（${Math.round(d)} 天）`);
      }
      density.textContent = gaps.length ? '⚠️ 期間有斷檔：' + gaps.join('、') + '；趨勢線跨斷檔僅供參考' : '';

      drawChart(trend, m);
      detail.replaceChildren(...trend.slice(-8).reverse().map((p) =>
        el('div', { class: 'card row between' }, [
          el('div', {}, [el('strong', {}, [p.date])]),
          el('div', { style: 'text-align:right' }, [el('div', {}, [`容量 ${Math.round(p.volume)}`]), el('div', { class: 'tiny muted' }, [`總次數 ${p.reps}`])]),
        ])));
    }

    function drawChart(trend, m) {
      if (chart) { chart.destroy(); chart = null; }
      if (!window.Chart || !chartWrap.isConnected) return;
      if (!chartWrap.querySelector('canvas')) chartWrap.replaceChildren(el('canvas', {}));
      const labels = trend.map((p) => p.date.slice(5));
      chart = mkChart(chartWrap.querySelector('canvas').getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: m.label, data: trend.map((p) => m.get(p)), borderColor: MUSCLE_COLORS[muscle], backgroundColor: MUSCLE_COLORS[muscle], tension: .25 }] },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: TICK } } },
          scales: { x: { ticks: { color: TICK }, grid: { color: GRID } }, y: { ticks: { color: TICK }, grid: { color: GRID }, beginAtZero: true } },
        },
      });
    }
  }

  function stat(k, v) { return el('div', { class: 'stat' }, [el('div', { class: 'k' }, [k]), el('div', { class: 'v' }, [v])]); }
}
