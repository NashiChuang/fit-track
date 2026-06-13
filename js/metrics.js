// ===== 計算層 =====
// 規格 4：衍生指標一律「查詢時即算、不存」。純函式，無副作用，好搬移。

// 單一動作在「一次訓練」裡的各項指標。
// sets: 該動作這次的所有組；includeWarmup: 是否把熱身組算進去。
export function exerciseSessionMetrics(sets, { includeWarmup = false } = {}) {
  const pool = includeWarmup ? sets : sets.filter((s) => !s.isWarmup);
  const use = pool.length ? pool : sets; // 全是熱身時退而用全部，避免空白
  if (!use.length) {
    return { topWeight: null, topReps: null, topSet: null, totalVolume: 0, totalReps: 0, avgWeight: null };
  }
  let topSet = use[0];
  let totalVolume = 0;
  let totalReps = 0;
  for (const s of use) {
    totalVolume += s.weight * s.reps;
    totalReps += s.reps;
    // 最重組：重量大者勝；同重量取次數多者
    if (s.weight > topSet.weight || (s.weight === topSet.weight && s.reps > topSet.reps)) topSet = s;
  }
  return {
    topWeight: topSet.weight,       // 最重組重量（絕對主力）
    topReps: topSet.reps,           // 頂組次數（主力搭檔）
    topSet,
    totalVolume,                    // 總容量 Σ(w×reps)
    totalReps,                      // 總次數 Σreps
    avgWeight: totalReps ? totalVolume / totalReps : null, // 平均重量
  };
}

// 把「一次訓練裡某動作的所有組」依 sessionId 分組後，逐次算出時間序列。
// rows: setsByExercise 的結果；sessionsById: Map(id -> session)
// 回傳 [{date, sessionId, ...metrics}] 依日期排序。
export function exerciseTrend(rows, sessionsById, opts = {}) {
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r);
  }
  const out = [];
  for (const [sessionId, sets] of bySession) {
    const session = sessionsById.get(sessionId);
    if (!session) continue;
    out.push({ date: session.date, sessionId, ...exerciseSessionMetrics(sets, opts) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// 肌群指標：把每組依動作的肌群權重攤到各肌群。
// allSets + exercisesById + sessionsById；period: 'week' | 'month'
// 回傳 { [bucket]: { [muscle]: {volume, reps} } }，bucket 為 'YYYY-Www' 或 'YYYY-MM'
export function muscleLoadByPeriod(allSets, exercisesById, sessionsById, period = 'week') {
  const out = {};
  for (const s of allSets) {
    const ex = exercisesById.get(s.exerciseId);
    const session = sessionsById.get(s.sessionId);
    if (!ex || !session) continue;
    const bucket = period === 'month' ? session.date.slice(0, 7) : isoWeek(session.date);
    out[bucket] = out[bucket] || {};
    const vol = s.weight * s.reps;
    for (const m of ex.muscles || []) {
      const w = m.weight ?? 1;
      out[bucket][m.muscle] = out[bucket][m.muscle] || { volume: 0, reps: 0 };
      out[bucket][m.muscle].volume += vol * w;
      out[bucket][m.muscle].reps += s.reps * w;
    }
  }
  return out;
}

// 某肌群「每日」總量趨勢（仿單動作，但聚合該肌群所有動作）。
// 排除熱身組；複合動作對它的每個部位都計入全額。
// 回傳 [{date, volume, reps}] 依日期排序。
export function muscleDailyTrend(allSets, exercisesById, sessionsById, muscle) {
  const byDate = new Map();
  for (const s of allSets) {
    if (s.isWarmup) continue;
    const ex = exercisesById.get(s.exerciseId);
    const session = sessionsById.get(s.sessionId);
    if (!ex || !session) continue;
    if (!(ex.muscles || []).some((m) => m.muscle === muscle)) continue;
    const d = session.date;
    if (!byDate.has(d)) byDate.set(d, { date: d, volume: 0, reps: 0 });
    const o = byDate.get(d);
    o.volume += s.weight * s.reps;
    o.reps += s.reps;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// 'YYYY-MM-DD' -> 'YYYY-Www'（ISO 週）。
export function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
  );
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
