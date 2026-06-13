// 一次訓練的記錄畫面（核心）。原則：大按鈕、少打字、多帶入。
import * as db from '../db.js';
import { el, esc, toast, confirmDialog, fmtNum, navigate } from '../ui.js';
import { getSettings } from '../state.js';
import { exerciseSessionMetrics } from '../metrics.js';
import { openExercisePicker } from '../exercise-picker.js';

export default async function session(ctx) {
  const id = ctx.params[0];
  const session = await db.get('sessions', id);
  if (!session) return el('div', { class: 'empty' }, ['找不到這次訓練']);

  const settings = getSettings();
  const [exList, allSessions, allSets] = await Promise.all([
    db.getAll('exercises'), db.getAll('sessions'), db.getAll('sets'),
  ]);
  const exById = new Map(exList.map((e) => [e.id, e]));
  const sessionsById = new Map(allSessions.map((s) => [s.id, s]));

  // 本次的組，依動作分組
  const currentSets = allSets.filter((s) => s.sessionId === id);
  const setsByEx = new Map();
  for (const s of currentSets) {
    if (!setsByEx.has(s.exerciseId)) setsByEx.set(s.exerciseId, []);
    setsByEx.get(s.exerciseId).push(s);
  }
  for (const arr of setsByEx.values()) arr.sort((a, b) => a.setOrder - b.setOrder);

  // 上次數據（排除本次，取最近一次該動作的頂組 + 整組明細供帶入）
  const hintByEx = new Map();
  const lastSetsByEx = new Map();
  {
    const byEx = new Map();
    for (const s of allSets) {
      if (s.sessionId === id) continue;
      if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, []);
      byEx.get(s.exerciseId).push(s);
    }
    for (const [exId, rows] of byEx) {
      const bySess = new Map();
      for (const r of rows) {
        if (!bySess.has(r.sessionId)) bySess.set(r.sessionId, []);
        bySess.get(r.sessionId).push(r);
      }
      let best = null;
      for (const [sid, sets] of bySess) {
        const sess = sessionsById.get(sid);
        if (!sess) continue;
        if (!best || sess.date > best.date) best = { date: sess.date, sets };
      }
      if (best) {
        const m = exerciseSessionMetrics(best.sets, { includeWarmup: false });
        hintByEx.set(exId, { date: best.date, topWeight: m.topWeight, topReps: m.topReps });
        lastSetsByEx.set(exId, best.sets);
      }
    }
  }

  // 同一範本的「上一次訓練」整組資料（帶入用）；用 templateId 或範本名稱(配對匯入的歷史紀錄)。
  const myTemplate = session.templateId ? await db.get('templates', session.templateId) : null;
  const lastTemplateSets = new Map();
  {
    const tplName = myTemplate?.name || null;
    const match = (s) => s.id !== id && s.committed !== false &&
      ((session.templateId && s.templateId === session.templateId) || (tplName && s.note === tplName));
    const prev = allSessions.filter(match).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt - a.createdAt))[0];
    if (prev) {
      for (const s of allSets) if (s.sessionId === prev.id) {
        if (!lastTemplateSets.has(s.exerciseId)) lastTemplateSets.set(s.exerciseId, []);
        lastTemplateSets.get(s.exerciseId).push(s);
      }
    }
  }

  // 動作清單與順序：沒有就從範本帶、再不然從現有組推。
  if (!Array.isArray(session.exerciseIds)) {
    let init = myTemplate ? [...myTemplate.exerciseIds] : [];
    for (const exId of setsByEx.keys()) if (!init.includes(exId)) init.push(exId);
    session.exerciseIds = init;
    await db.put('sessions', session);
    // 新訓練：每個動作直接帶出「上次的組」，可微調；沒上次資料就給一個空組
    for (const exId of init) if (!(setsByEx.get(exId) || []).length) await prefillFromLast(exId);
  }

  const screen = el('div', { class: 'screen' });

  // 標題列動作：完成 + （新訓練→取消 / 既有→刪除）
  const isNew = session.committed === false;
  ctx.setActions([
    isNew
      ? el('button', { class: 'btn btn-ghost btn-sm', onclick: cancelSession }, ['取消'])
      : el('button', { class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)', onclick: deleteSession }, ['刪除']),
    el('button', { class: 'btn btn-primary btn-sm', onclick: complete }, ['完成']),
  ]);

  // ---- 頂端：範本名稱 + 日期（固定）----
  const sessionName = (myTemplate?.name || session.note || '').trim();
  screen.append(el('div', { class: 'sticky-head' }, [
    el('div', { class: 'row between', style: 'gap:10px; align-items:center' }, [
      el('strong', { class: 'grow ellipsis', style: 'font-size:17px' }, [sessionName]),
      el('input', { type: 'date', value: session.date, style: 'width:auto; flex:0 0 auto', onchange: (e) => save({ date: e.target.value }) }),
    ]),
  ]));

  // ---- 各動作 ----
  const exContainer = el('div', { class: 'stack' });
  screen.append(exContainer);
  renderAllExercises();

  // ---- 加入動作 ----
  screen.append(el('button', { class: 'btn btn-block', onclick: openAddExercise }, ['＋ 加入動作']));

  return screen;

  // ===== 內部函式 =====
  async function save(patch) {
    Object.assign(session, patch);
    await db.put('sessions', session);
  }

  function renderAllExercises() {
    if (!session.exerciseIds.length) {
      exContainer.replaceChildren(el('div', { class: 'empty' }, [
        el('div', { class: 'big' }, ['➕']), el('div', {}, ['還沒有動作']),
        el('div', { class: 'small muted' }, ['用下方「加入動作」開始']),
      ]));
      return;
    }
    exContainer.replaceChildren(...session.exerciseIds.map((exId) => renderExerciseBlock(exId)));
  }

  function renderExerciseBlock(exId) {
    const ex = exById.get(exId);
    const sets = setsByEx.get(exId) || [];
    const hint = hintByEx.get(exId);

    const setList = el('div', {});
    const block = el('div', { class: 'card stack' });
    const countBadge = el('span', { class: 'badge' });

    function redraw() {
      setList.replaceChildren(...sets.map((s, i) => renderSetRow(exId, s, i, redraw)));
      const done = sets.filter((s) => s.done !== false).length;
      countBadge.textContent = sets.length ? `✓ ${done}/${sets.length} 完成` : '';
      countBadge.style.display = sets.length ? '' : 'none';
      countBadge.classList.toggle('ok', sets.length > 0 && done === sets.length);
    }
    redraw();

    block.append(
      el('div', { class: 'row between' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'row wrap', style: 'gap:8px' }, [
            el('strong', {}, [ex ? ex.name : '（已刪除的動作）']),
            countBadge,
          ]),
          hint
            ? el('div', { class: 'small muted' }, [`上次（${hint.date}）頂組 ${fmtNum(hint.topWeight)}kg × ${hint.topReps}`])
            : el('div', { class: 'small muted' }, ['這動作第一次記錄']),
        ]),
        el('div', { class: 'row', style: 'gap:4px' }, [
          el('button', { class: 'btn btn-icon btn-sm btn-ghost', title: '上移', disabled: session.exerciseIds.indexOf(exId) === 0 ? true : null, onclick: () => moveExercise(exId, -1) }, ['↑']),
          el('button', { class: 'btn btn-icon btn-sm btn-ghost', title: '下移', disabled: session.exerciseIds.indexOf(exId) === session.exerciseIds.length - 1 ? true : null, onclick: () => moveExercise(exId, 1) }, ['↓']),
          el('button', { class: 'btn btn-icon btn-ghost', title: '移除此動作', onclick: () => removeExercise(exId) }, ['✕']),
        ]),
      ]),
      setList,
      el('div', { class: 'row wrap', style: 'gap:8px' }, [
        el('button', { class: 'btn btn-sm grow', onclick: () => copyLast(exId, redraw), disabled: sets.length ? null : true },
          ['⧉ 複製上一組']),
        el('button', { class: 'btn btn-sm btn-primary grow', onclick: () => addSet(exId, redraw) }, ['＋ 新增一組']),
      ]),
    );
    return block;
  }

  function renderSetRow(exId, s, i, redraw) {
    const checked = s.done !== false; // 既有/匯入(undefined)視為已完成；新帶入的組為 false
    const setType = (w) => { if (s.isWarmup === w) return; s.isWarmup = w; db.put('sets', s); redraw(); };
    const seg = el('div', { class: 'seg' }, [
      el('button', { class: s.isWarmup ? '' : 'on', onclick: () => setType(false) }, ['正式']),
      el('button', { class: s.isWarmup ? 'on warm' : '', onclick: () => setType(true) }, ['熱身']),
    ]);
    const check = el('button', {
      class: 'checkbox' + (checked ? ' on' : ''), title: '完成這組',
      onclick: () => { s.done = !checked; db.put('sets', s); redraw(); },
    }, [checked ? '✓' : '']);

    // 重量：直接輸入（不用加減）
    const weightInput = el('input', { type: 'number', inputmode: 'decimal', step: String(settings.weightStep), value: String(s.weight), class: 'wfield' });
    weightInput.onchange = () => { let v = Math.max(0, parseFloat(weightInput.value) || 0); v = Math.round(v * 100) / 100; weightInput.value = String(v); s.weight = v; db.put('sets', s); };
    const weight = el('div', { class: 'grow' }, [el('div', { class: 'tiny muted', style: 'text-align:center' }, ['kg']), weightInput]);
    // 次數：保留加減
    const reps = stepper(s.reps, settings.repStep, 0, (v) => { s.reps = v; db.put('sets', s); }, '下');

    return el('div', { class: 'setrow2' + (s.isWarmup ? ' warm' : '') + (checked ? ' done-row' : '') }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'row', style: 'gap:10px' }, [check, el('span', { class: 'idx2' }, ['第 ' + (i + 1) + ' 組']), seg]),
        el('button', { class: 'btn btn-icon btn-sm btn-ghost', title: '刪除這組', onclick: () => deleteSet(exId, s, redraw) }, ['✕']),
      ]),
      el('div', { class: 'row', style: 'gap:10px' }, [weight, reps]),
    ]);
  }

  // 步進輸入元件：[－] [數字] [＋]，少叫鍵盤。
  function stepper(value, step, min, onChange, unit) {
    const input = el('input', { type: 'number', inputmode: 'decimal', step: String(step), value: String(value) });
    const commit = (v) => {
      v = Math.max(min, Math.round(v * 100) / 100);
      input.value = String(v);
      onChange(v);
    };
    input.onchange = () => commit(parseFloat(input.value) || 0);
    return el('div', { class: 'grow' }, [
      el('div', { class: 'tiny muted', style: 'text-align:center' }, [unit]),
      el('div', { class: 'stepper' }, [
        el('button', { onclick: () => commit((parseFloat(input.value) || 0) - step) }, ['－']),
        input,
        el('button', { onclick: () => commit((parseFloat(input.value) || 0) + step) }, ['＋']),
      ]),
    ]);
  }

  // 把「上次該動作的整組」帶進這次（重量/次數/熱身照搬）。
  // 優先用同一範本的上一次訓練；沒有再退回該動作各處最近一次；都沒有就放一個空組。
  async function prefillFromLast(exId) {
    const arr = setsByEx.get(exId) || (setsByEx.set(exId, []), setsByEx.get(exId));
    if (arr.length) return; // 已有組就不蓋
    const src = (lastTemplateSets.get(exId)?.length ? lastTemplateSets.get(exId) : lastSetsByEx.get(exId)) || [];
    const last = src.slice().sort((a, b) => a.setOrder - b.setOrder);
    const seeds = last.length ? last : [{ weight: 0, reps: 0, isWarmup: false }];
    for (let i = 0; i < seeds.length; i++) {
      const s = { id: db.uid(), sessionId: id, exerciseId: exId, setOrder: i, weight: seeds[i].weight ?? 0, reps: seeds[i].reps ?? 0, isWarmup: !!seeds[i].isWarmup, done: false };
      arr.push(s);
      await db.put('sets', s);
    }
  }

  async function addSet(exId, redraw, base) {
    const sets = setsByEx.get(exId) || (setsByEx.set(exId, []), setsByEx.get(exId));
    const last = sets[sets.length - 1];
    const hint = hintByEx.get(exId);
    const seed = base || last || (hint ? { weight: hint.topWeight, reps: hint.topReps, isWarmup: false } : { weight: 0, reps: 0, isWarmup: false });
    const s = {
      id: db.uid(), sessionId: id, exerciseId: exId,
      setOrder: sets.length, weight: seed.weight ?? 0, reps: seed.reps ?? 0,
      isWarmup: base ? !!base.isWarmup : false,
      done: true, // 訓練中手動新增/複製的組＝當下完成，預設打勾
    };
    sets.push(s);
    await db.put('sets', s);
    redraw();
  }

  function copyLast(exId, redraw) {
    const sets = setsByEx.get(exId) || [];
    const last = sets[sets.length - 1];
    if (!last) return;
    addSet(exId, redraw, { weight: last.weight, reps: last.reps, isWarmup: last.isWarmup });
  }

  async function deleteSet(exId, s, redraw) {
    const sets = setsByEx.get(exId) || [];
    const i = sets.indexOf(s);
    if (i >= 0) sets.splice(i, 1);
    sets.forEach((x, k) => { x.setOrder = k; db.put('sets', x); }); // 重排序號
    await db.del('sets', s.id);
    redraw();
  }

  async function moveExercise(exId, dir) {
    const arr = session.exerciseIds;
    const i = arr.indexOf(exId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await db.put('sessions', session);
    await syncTemplate();
    renderAllExercises();
  }

  // 訓練中改了動作/順序 → 自動同步回同一個範本（只存動作與順序）。
  async function syncTemplate() {
    if (!myTemplate) return;
    const a = session.exerciseIds, b = myTemplate.exerciseIds || [];
    const same = a.length === b.length && a.every((x, i) => x === b[i]);
    if (same) return;
    myTemplate.exerciseIds = [...session.exerciseIds];
    await db.put('templates', myTemplate);
  }

  async function removeExercise(exId) {
    const ex = exById.get(exId);
    const sets = setsByEx.get(exId) || [];
    if (sets.length) {
      const ok = await confirmDialog(`移除「${ex ? ex.name : '此動作'}」？這次記錄的 ${sets.length} 組會一起刪除。`, { danger: true, okText: '移除' });
      if (!ok) return;
    }
    for (const s of sets) await db.del('sets', s.id);
    setsByEx.delete(exId);
    session.exerciseIds = session.exerciseIds.filter((x) => x !== exId);
    await db.put('sessions', session);
    await syncTemplate();
    renderAllExercises();
  }

  function openAddExercise() {
    openExercisePicker({
      exList,
      isAdded: (ex) => session.exerciseIds.includes(ex.id),
      onPick: async (ex) => {
        session.exerciseIds.push(ex.id);
        await db.put('sessions', session);
        await prefillFromLast(ex.id);
        await syncTemplate();
        renderAllExercises();
      },
      title: '加入動作',
    });
  }

  async function deleteSession() {
    const ok = await confirmDialog('刪除整次訓練紀錄？這次的所有組都會刪除。', { danger: true, okText: '刪除' });
    if (!ok) return;
    await db.deleteSessionCascade(id);
    toast('已刪除');
    navigate('#/');
  }

  // 完成：只保留打勾的組，未打勾的丟掉；沒有動作就移除；全空就刪掉整筆。
  async function complete() {
    let total = 0;
    for (const [exId, arr] of setsByEx) {
      const keep = arr.filter((s) => s.done !== false);
      const drop = arr.filter((s) => s.done === false);
      for (const s of drop) await db.del('sets', s.id);
      keep.forEach((s, i) => { if (s.setOrder !== i) { s.setOrder = i; db.put('sets', s); } });
      setsByEx.set(exId, keep);
      total += keep.length;
    }
    session.exerciseIds = session.exerciseIds.filter((exId) => (setsByEx.get(exId) || []).length);
    if (total === 0) {
      await db.deleteSessionCascade(id);
      toast('沒有勾選任何組，未建立紀錄');
      navigate('#/');
      return;
    }
    session.committed = true;
    await db.put('sessions', session);
    toast('已儲存紀錄');
    navigate('#/');
  }

  // 取消：整筆新訓練丟棄（不存）。
  async function cancelSession() {
    const ok = await confirmDialog('取消這次訓練？輸入的內容都不會保存。', { danger: true, okText: '取消訓練', cancelText: '繼續' });
    if (!ok) return;
    await db.deleteSessionCascade(id);
    toast('已取消');
    navigate('#/');
  }
}
