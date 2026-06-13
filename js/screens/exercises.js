// 動作庫 + 分部範本。兩個分頁。
import * as db from '../db.js';
import { el, esc, toast, confirmDialog, navigate } from '../ui.js';
import { MUSCLES } from '../state.js';

export default async function exercises(ctx) {
  const screen = el('div', { class: 'screen' });
  let tab = ctx.params[0] === 'tpl' ? 'tpl' : 'ex'; // 可由 #/exercises/tpl 指定開在範本分頁
  let exFilter = null; // 部位篩選：null = 全部

  const tabs = el('div', { class: 'tabs' }, [
    el('button', { onclick: () => switchTab('ex') }, ['動作']),
    el('button', { onclick: () => switchTab('tpl') }, ['範本']),
  ]);
  const controls = el('div', { class: 'stack' }); // 隨分頁變動的頂部控制（固定）
  const listArea = el('div', { class: 'stack' });  // 捲動內容
  screen.append(el('div', { class: 'sticky-head' }, [tabs, controls]), listArea);

  function switchTab(t) {
    tab = t;
    tabs.children[0].classList.toggle('on', t === 'ex');
    tabs.children[1].classList.toggle('on', t === 'tpl');
    refresh();
  }

  async function refresh() {
    controls.replaceChildren();
    listArea.replaceChildren(el('div', { class: 'empty' }, ['載入中…']));
    if (tab === 'ex') await renderExercises();
    else await renderTemplates();
  }

  // ---------- 動作分頁 ----------
  async function renderExercises() {
    const list = await db.getAll('exercises');
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const hasMuscle = (ex, m) => (ex.muscles || []).some((x) => x.muscle === m);
    const counts = Object.fromEntries(MUSCLES.map((m) => [m, list.filter((ex) => hasMuscle(ex, m)).length]));

    function draw() {
      const mkChip = (label, n, on, val) =>
        el('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { exFilter = val; draw(); } },
          [label, n != null ? el('span', { class: 'chip-n' }, [String(n)]) : null]);
      controls.replaceChildren(
        el('button', { class: 'btn btn-primary btn-block', onclick: () => openExerciseEditor(null, refresh) }, ['＋ 新增動作']),
        el('div', { class: 'chips filter-bar' }, [
          mkChip('全部', list.length, exFilter === null, null),
          ...MUSCLES.map((m) => mkChip(m, counts[m], exFilter === m, m)),
        ]),
      );
      if (!list.length) {
        listArea.replaceChildren(el('div', { class: 'empty' }, [
          el('div', { class: 'big' }, ['🏋️']), el('div', {}, ['還沒有動作']),
          el('div', { class: 'small muted' }, ['建立動作時順手綁定肌群']),
        ]));
        return;
      }
      const filtered = exFilter ? list.filter((ex) => hasMuscle(ex, exFilter)) : list;
      if (!filtered.length) { listArea.replaceChildren(el('div', { class: 'empty' }, [el('div', { class: 'small muted' }, [`「${exFilter}」沒有動作`])])); return; }
      const nodes = [el('div', { class: 'tiny muted' }, [`${filtered.length} 個動作` + (exFilter ? `（${exFilter}）` : '')])];
      for (const ex of filtered) {
        nodes.push(el('div', { class: 'card tap', onclick: () => openExerciseEditor(ex, refresh) }, [
          el('div', { class: 'row between' }, [
            el('div', { class: 'grow' }, [
              el('strong', {}, [ex.name]),
              el('div', { class: 'chips', style: 'margin-top:6px' }, (ex.muscles || []).map((m) => el('span', { class: 'badge' }, [m.muscle]))),
            ]),
            el('span', { class: 'muted' }, ['編輯 ›']),
          ]),
        ]));
      }
      listArea.replaceChildren(...nodes);
    }
    draw();
  }

  // ---------- 範本分頁 ----------
  async function renderTemplates() {
    const [templates, exList] = await Promise.all([db.getAll('templates'), db.getAll('exercises')]);
    const exById = new Map(exList.map((e) => [e.id, e]));
    templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    controls.replaceChildren(
      el('button', { class: 'btn btn-primary btn-block', onclick: () => navigate('#/template/new') }, ['＋ 新增範本']),
    );
    const nodes = [];
    if (!exList.length) nodes.push(el('div', { class: 'empty' }, [el('div', { class: 'small muted' }, ['先建立一些動作，才能組成範本'])]));
    if (!templates.length) {
      nodes.push(el('div', { class: 'empty' }, [
        el('div', { class: 'big' }, ['🗂️']), el('div', {}, ['還沒有範本']),
        el('div', { class: 'small muted' }, ['例如「周六(胸+肩+三頭)」，套用時一鍵帶出整套動作']),
      ]));
    }
    for (const t of templates) {
      const names = (t.exerciseIds || []).map((id) => exById.get(id)?.name).filter(Boolean);
      nodes.push(el('div', { class: 'card tap', onclick: () => navigate('#/template/' + t.id) }, [
        el('div', { class: 'row between' }, [
          el('div', { class: 'grow' }, [
            el('strong', {}, [t.name]),
            el('div', { class: 'small muted ellipsis', style: 'margin-top:4px' }, [names.join('、') || '（沒有動作）']),
          ]),
          el('span', { class: 'muted' }, ['編輯 ›']),
        ]),
      ]));
    }
    listArea.replaceChildren(...nodes);
  }

  switchTab(tab);
  return screen;
}

// ============ 動作編輯器 ============
function openExerciseEditor(existing, onDone) {
  const working = {
    id: existing?.id || db.uid(),
    name: existing?.name || '',
    muscles: new Set((existing?.muscles || []).map((m) => m.muscle)),
  };
  const close = () => overlay.remove();

  const chips = el('div', { class: 'chips' }, MUSCLES.map((m) => {
    const chip = el('span', { class: 'chip' + (working.muscles.has(m) ? ' on' : '') }, [m]);
    chip.onclick = () => {
      if (working.muscles.has(m)) working.muscles.delete(m);
      else working.muscles.add(m);
      chip.classList.toggle('on');
    };
    return chip;
  }));

  const nameInput = el('input', { type: 'text', placeholder: '動作名稱，如：槓鈴臥推', value: working.name });

  async function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('請輸入動作名稱'); return; }
    const muscles = [...working.muscles].map((muscle) => ({ muscle, weight: 1 }));
    await db.put('exercises', { id: working.id, name, muscles, createdAt: existing?.createdAt || Date.now() });
    close(); toast('已儲存'); onDone();
  }
  async function remove() {
    const ok = await confirmDialog(`刪除動作「${existing.name}」？（過去紀錄不會刪，但會對不到名稱）`, { danger: true, okText: '刪除' });
    if (!ok) return;
    await db.del('exercises', existing.id);
    close(); toast('已刪除'); onDone();
  }

  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal' }, [
      el('div', { class: 'modal-body stack' }, [
        el('div', { style: 'font-weight:700' }, [existing ? '編輯動作' : '新增動作']),
        el('label', { class: 'field' }, [el('span', {}, ['名稱']), nameInput]),
        el('label', { class: 'field' }, [el('span', {}, ['肌群（通常選一個；複合動作可多選，如硬拉＝腿臀＋背）']), chips]),
      ]),
      el('div', { class: 'modal-actions' }, [
        existing ? el('button', { class: 'btn btn-danger btn-sm', onclick: remove }, ['刪除']) : null,
        el('button', { class: 'btn btn-ghost', onclick: close }, ['取消']),
        el('button', { class: 'btn btn-primary', onclick: save }, ['儲存']),
      ]),
    ]),
  ]);
  document.body.append(overlay);
  setTimeout(() => nameInput.focus(), 50);
}

// 範本改用整頁編輯（js/screens/template.js），不再用此處的小視窗。
