// 共用的小工具：建立元素、跳訊息、確認框等。畫面共用，避免重複。

// 把使用者輸入的文字轉成安全的 HTML（避免名稱含特殊字元破版 / 注入）。
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 建立元素：el('button', {class:'btn', onclick:fn}, ['文字'])
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function navigate(hash) {
  if (hash && hash[0] !== '#') hash = '#' + hash;
  // 用 replaceState 換頁，不堆積瀏覽器歷史（返回鍵由 app.js 依階層處理）
  if (location.hash !== hash) history.replaceState(history.state, '', hash);
  render();
}

// 轉頁用：app.js 會把真正的 render 注入進來。
let _render = () => {};
export function setRender(fn) { _render = fn; }
export function render() { _render(); }

// ---- 跳出短訊息（toast）----
export function toast(msg) {
  let host = $('#toast');
  if (!host) {
    host = el('div', { id: 'toast' });
    document.body.append(host);
  }
  const t = el('div', { class: 'toast-item' }, [msg]);
  host.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ---- 確認框（回傳 Promise<boolean>）----
export function confirmDialog(message, { okText = '確定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (val) => { overlay.remove(); resolve(val); };
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(false); } }, [
      el('div', { class: 'modal' }, [
        el('div', { class: 'modal-body' }, [message]),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn btn-ghost', onclick: () => close(false) }, [cancelText]),
          el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => close(true) }, [okText]),
        ]),
      ]),
    ]);
    document.body.append(overlay);
  });
}

// 數字格式：去掉多餘小數（72.0 -> 72，72.5 -> 72.5）。
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '–';
  return Number(n).toFixed(2).replace(/\.?0+$/, '');
}
