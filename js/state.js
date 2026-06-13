// 全域常數與使用者偏好設定（偏好存在 localStorage，輕量即可）。

// 肌群分類（規格 2.1）。
export const MUSCLES = ['胸', '背', '肩', '二頭', '三頭', '腿臀'];

const SETTINGS_KEY = 'fit-track-settings';
const DEFAULTS = {
  weightStep: 2.5, // 重量 +/- 一次跳多少 kg
  repStep: 1,      // 次數 +/- 一次跳多少
  lastMetric: 'topWeight', // 報表上次選的指標
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
