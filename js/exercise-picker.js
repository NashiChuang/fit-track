// 共用的「加入動作」挑選器：先選部位、再選動作。記錄頁與範本頁共用。
import { el } from './ui.js';
import { MUSCLES } from './state.js';

// opts: { exList, isAdded(ex)->bool, onPick(ex), title, emptyHint }
// 只列出「還沒加入」的動作；選一個就加入並關閉。
export function openExercisePicker({ exList, isAdded = () => false, onPick, title = '加入動作', emptyHint }) {
  let part = null;
  const close = () => overlay.remove();
  const hasMuscle = (ex, m) => (ex.muscles || []).some((x) => x.muscle === m);
  const sorted = exList.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  const bar = el('div', { class: 'chips filter-bar' });
  const listWrap = el('div', { class: 'stack', style: 'max-height:52vh;overflow:auto' });

  function render() {
    const available = sorted.filter((e) => !isAdded(e)); // 只留還沒加入的
    const counts = Object.fromEntries(MUSCLES.map((m) => [m, available.filter((e) => hasMuscle(e, m)).length]));
    const mkChip = (label, n, on, val) =>
      el('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { part = val; render(); } },
        [label, el('span', { class: 'chip-n' }, [String(n)])]);
    bar.replaceChildren(mkChip('全部', available.length, part === null, null),
      ...MUSCLES.map((m) => mkChip(m, counts[m], part === m, m)));

    if (!available.length) {
      listWrap.replaceChildren(el('div', { class: 'small muted' }, [exList.length ? '已經沒有可加入的動作了' : (emptyHint || '動作庫還沒有動作，請先到「動作庫」新增')]));
      return;
    }
    const filtered = part ? available.filter((e) => hasMuscle(e, part)) : available;
    listWrap.replaceChildren(...filtered.map((ex) =>
      el('button', { class: 'btn btn-block', onclick: () => { onPick(ex); close(); } }, [ex.name])));
  }
  render();

  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal', style: 'max-width:440px' }, [
      el('div', { class: 'modal-body stack' }, [
        el('div', { style: 'font-weight:700' }, [title]),
        el('div', { class: 'tiny muted' }, ['先選部位，再選動作']),
        bar, listWrap,
      ]),
      el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-ghost', onclick: close }, ['取消'])]),
    ]),
  ]);
  document.body.append(overlay);
  return { close };
}
