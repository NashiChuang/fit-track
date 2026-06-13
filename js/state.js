// 全域常數與使用者偏好設定（偏好存在 localStorage，輕量即可）。

// 肌群分類（規格 2.1）。
export const MUSCLES = ['胸', '背', '肩', '二頭', '三頭', '腿臀'];

// 動作排序：先比「動作主體」（括號前），再比「工具」（括號內），
// 讓同一動作的不同工具/器械排在一起、順序固定。
export function exerciseSortKey(name) {
  const m = String(name).match(/^(.*?)（([^）]*)）/);
  return m ? [m[1], m[2]] : [String(name), ''];
}
export function compareExercises(a, b) {
  const ka = exerciseSortKey(a.name);
  const kb = exerciseSortKey(b.name);
  return ka[0].localeCompare(kb[0], 'zh-Hant') || ka[1].localeCompare(kb[1], 'zh-Hant');
}

const SETTINGS_KEY = 'fit-track-settings';
const DEFAULTS = {
  repStep: 1,      // 次數 +/- 一次跳多少（重量已改純輸入，不需步進）
  lastMetric: 'topWeight', // 報表上次選的指標
  avgWindow: 4,    // 報表移動平均線：取過去幾次/幾日
};

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  return s;
}

// 今天日期，格式 YYYY-MM-DD（本地時區）。
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
