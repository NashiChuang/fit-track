// App 入口：負責「現在該顯示哪個畫面」（hash 路由）、導覽列、Service Worker。
import { $, $$, el, setRender, toast, navigate, confirmDialog } from './ui.js';
import { ensureSeed } from './db.js';
import homeScreen from './screens/home.js';
import exercisesScreen from './screens/exercises.js';
import sessionScreen from './screens/session.js';
import templateScreen from './screens/template.js';
import reportScreen from './screens/report.js';
import settingsScreen from './screens/settings.js';

const ROUTES = {
  home: { render: homeScreen, title: '記錄', nav: 'home' },
  exercises: { render: exercisesScreen, title: '動作庫', nav: 'exercises' },
  session: { render: sessionScreen, title: '訓練', nav: 'home' },
  template: { render: templateScreen, title: '範本', nav: 'exercises' },
  report: { render: reportScreen, title: '報表', nav: 'report' },
  settings: { render: settingsScreen, title: '設定', nav: 'settings' },
};

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, ''); // 去掉開頭 #/
  const parts = raw.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  return { name: ROUTES[name] ? name : 'home', params: parts.slice(1) };
}

const appbar = {
  titleEl: () => $('#appbar-title'),
  actionsEl: () => $('#appbar-actions'),
  backEl: () => $('#back-btn'),
};

let currentRoute = 'home'; // 目前畫面（給返回鍵判斷階層用）

async function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];
  currentRoute = name;

  // 重設標題列
  appbar.titleEl().textContent = route.title;
  appbar.actionsEl().replaceChildren();
  const back = appbar.backEl();
  if (route.back) {
    back.hidden = false;
    back.onclick = () => { navigate(route.back); };
  } else {
    back.hidden = true;
    back.onclick = null;
  }

  // 導覽列高亮
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === route.nav));

  const ctx = {
    params,
    setTitle: (t) => { appbar.titleEl().textContent = t; },
    setActions: (nodes) => appbar.actionsEl().replaceChildren(...[].concat(nodes).filter(Boolean)),
    setBack: (hash) => {
      if (hash) { back.hidden = false; back.onclick = () => { navigate(hash); }; }
    },
  };

  const host = $('#app');
  host.replaceChildren(el('div', { class: 'empty' }, ['載入中…']));
  try {
    const node = await route.render(ctx);
    host.replaceChildren(node);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    host.replaceChildren(el('div', { class: 'empty' }, [
      el('div', { class: 'big' }, ['⚠️']),
      el('div', {}, ['畫面載入失敗']),
      el('div', { class: 'small muted' }, [String(err && err.message || err)]),
    ]));
  }
}

setRender(render);

// 底部導覽列點擊改走 navigate（用 replaceState，不堆積瀏覽器歷史）
$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
});

// Android 返回鍵：依功能階層，而非上一個畫面。
// 做法：固定保留一個「守衛」歷史項，返回時觸發 popstate 由我們決定去向。
function parentTarget(name) {
  if (name === 'home') return null;          // 根層 → 詢問離開
  if (name === 'template') return '#/exercises/tpl'; // 範本編輯 → 範本分頁
  return '#/';                               // 動作庫/報表/設定/訓練 → 記錄
}
let exitAsking = false;
async function confirmExit() {
  if (exitAsking) return;
  exitAsking = true;
  const leave = await confirmDialog('要離開 App 嗎？', { okText: '確認離開', cancelText: '留下', danger: true });
  exitAsking = false;
  if (leave) { window.removeEventListener('popstate', onPop); history.go(-2); }
}
function onPop() {
  history.pushState({ d: 1 }, ''); // 立即補回守衛，維持可攔截
  const t = parentTarget(currentRoute);
  if (t) navigate(t);
  else confirmExit();
}
window.addEventListener('popstate', onPop);

// 首次啟動：資料庫為空時載入預設動作庫/範本 → 渲染 → 建立返回守衛
ensureSeed().catch(() => {}).then(() => {
  render();
  history.replaceState({ d: 0 }, '');  // 基底（離開點）
  history.pushState({ d: 1 }, '');     // 守衛（目前停留處）
});

// 註冊 Service Worker（可安裝 + 離線）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 註冊失敗', e));
  });
}
