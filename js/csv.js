// 通用 CSV 工具：序列化與解析（處理含逗號/引號/換行的欄位）。
export function csvEscape(v) {
  v = v == null ? '' : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n'); // 前置 BOM，Excel 開中文不亂碼
}

// 回傳 array of rows（每列是字串陣列）
export function parseCsv(text) {
  const out = [];
  let row = [], cur = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') { q = true; }
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); cur = ''; out.push(row); row = []; }
    else if (c === '\r') { /* 忽略 */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  // 去掉完全空白的列
  return out.filter((r) => r.some((c) => String(c).trim() !== ''));
}
