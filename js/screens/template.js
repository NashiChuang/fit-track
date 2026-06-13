// 範本編輯（整頁，仿「記錄」畫面）：名稱 + 動作清單（可排序）+ 加入動作。
import * as db from '../db.js';
import { el, toast, confirmDialog, navigate } from '../ui.js';
import { openExercisePicker } from '../exercise-picker.js';

export default async function template(ctx) {
  const idParam = ctx.params[0];
  const isNew = idParam === 'new';
  const exList = await db.getAll('exercises');
  const exById = new Map(exList.map((e) => [e.id, e]));
  const tpl = isNew
    ? { id: db.uid(), name: '', exerciseIds: [], createdAt: Date.now() }
    : await db.get('templates', idParam);
  if (!tpl) return el('div', { class: 'empty' }, ['找不到這個範本']);

  ctx.setTitle(isNew ? '新增範本' : '編輯範本');
  ctx.setActions([
    isNew ? null : el('button', { class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)', onclick: remove }, ['刪除']),
    el('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate('#/exercises') }, ['取消']),
    el('button', { class: 'btn btn-primary btn-sm', onclick: save }, ['儲存']),
  ]);

  const screen = el('div', { class: 'screen' });
  const nameInput = el('input', { type: 'text', placeholder: '範本名稱，如：周六(胸+肩+三頭)', value: tpl.name });
  screen.append(el('div', { class: 'card stack' }, [
    el('label', { class: 'field' }, [el('span', {}, ['範本名稱']), nameInput]),
  ]));

  const listWrap = el('div', { class: 'stack' });
  screen.append(listWrap);
  screen.append(el('button', { class: 'btn btn-block', onclick: openAdd }, ['＋ 加入動作']));
  renderList();
  return screen;

  function renderList() {
    if (!tpl.exerciseIds.length) {
      listWrap.replaceChildren(el('div', { class: 'empty' }, [
        el('div', { class: 'big' }, ['➕']), el('div', {}, ['還沒有動作']),
        el('div', { class: 'small muted' }, ['用下方「加入動作」挑選；順序就是套用時帶出的順序']),
      ]));
      return;
    }
    listWrap.replaceChildren(...tpl.exerciseIds.map((exId, i) => {
      const ex = exById.get(exId);
      return el('div', { class: 'card row between' }, [
        el('div', { class: 'row', style: 'gap:10px' }, [
          el('span', { class: 'idx2' }, [String(i + 1)]),
          el('strong', {}, [ex ? ex.name : '（已刪除的動作）']),
        ]),
        el('div', { class: 'row', style: 'gap:4px' }, [
          el('button', { class: 'btn btn-icon btn-sm btn-ghost', disabled: i === 0 ? true : null, onclick: () => move(i, -1) }, ['↑']),
          el('button', { class: 'btn btn-icon btn-sm btn-ghost', disabled: i === tpl.exerciseIds.length - 1 ? true : null, onclick: () => move(i, 1) }, ['↓']),
          el('button', { class: 'btn btn-icon btn-sm btn-ghost', onclick: () => { tpl.exerciseIds.splice(i, 1); renderList(); } }, ['✕']),
        ]),
      ]);
    }));
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= tpl.exerciseIds.length) return;
    const a = tpl.exerciseIds;
    [a[i], a[j]] = [a[j], a[i]];
    renderList();
  }

  function openAdd() {
    openExercisePicker({
      exList,
      isAdded: (ex) => tpl.exerciseIds.includes(ex.id),
      onPick: (ex) => { if (!tpl.exerciseIds.includes(ex.id)) tpl.exerciseIds.push(ex.id); renderList(); },
      title: '加入動作',
    });
  }

  async function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('請輸入範本名稱'); return; }
    if (!tpl.exerciseIds.length) { toast('至少加入一個動作'); return; }
    tpl.name = name;
    await db.put('templates', tpl);
    toast('已儲存'); navigate('#/exercises');
  }

  async function remove() {
    const ok = await confirmDialog(`刪除範本「${tpl.name}」？`, { danger: true, okText: '刪除' });
    if (!ok) return;
    await db.del('templates', tpl.id);
    toast('已刪除'); navigate('#/exercises');
  }
}
