// App 入口：負責「現在該顯示哪個畫面」（hash 路由）、導覽列、Service Worker。
import { $, $$, el, setRender, toast } from './ui.js';
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

async function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];

  // 重設標題列
  appbar.titleEl().textContent = route.title;
  appbar.actionsEl().replaceChildren();
  const back = appbar.backEl();
  if (route.back) {
    back.hidden = false;
    back.onclick = () => { location.hash = route.back; };
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
      if (hash) { back.hidden = false; back.onclick = () => { location.hash = hash; }; }
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
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
// DOMContentLoaded 可能已經過了（module 延後執行），保險起見直接跑一次
if (document.readyState !== 'loading') render();

// 註冊 Service Worker（可安裝 + 離線）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 註冊失敗', e));
  });
}
