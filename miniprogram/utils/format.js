/**
 * 纯函数工具：日期、分组、进度计算
 */
const { CATEGORY_MAP, LEVELS } = require('../constants');

/** 统一日期格式：2026.10.21 */
function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** 供 picker 使用的 YYYY-MM-DD */
function toISODate(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 进度与等级
 * 关键：分母取「当前清单总数」，等级按百分比阈值，
 * 因此用户增删清单后进度仍然自洽（见方案 v2 第五节）。
 */
function calcProgress(things) {
  const total = things.length;
  const done = things.filter(t => t.status === 'treasured').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  let current = LEVELS[0];
  for (const lv of LEVELS) {
    if (pct >= lv.min) current = lv;
  }

  const next = LEVELS.find(lv => lv.min > pct) || null;
  let gap = 0;
  if (next) {
    gap = Math.max(0, Math.ceil((next.min / 100) * total) - done);
  }

  return {
    total,
    done,
    pct,
    level: current,
    next,
    gap,
    levelText: `Lv.${current.lv} ${current.name}`,
  };
}

/** 按分类分组，保持 constants 中的分类顺序 */
function groupByCategory(things) {
  const bucket = {};
  things.forEach(t => {
    if (!bucket[t.category]) bucket[t.category] = [];
    bucket[t.category].push(t);
  });
  return Object.keys(bucket).map(key => ({
    key,
    name: CATEGORY_MAP[key] || key,
    items: bucket[key],
  }));
}

/** 最近珍藏时间线 */
function recentTreasured(things, limit = 10) {
  return things
    .filter(t => t.status === 'treasured')
    .sort((a, b) => String(b.doneDate).localeCompare(String(a.doneDate)))
    .slice(0, limit);
}

/** 心情 Top N */
function moodTop(things, limit = 3) {
  const count = {};
  things.forEach(t => {
    if (t.status === 'treasured' && t.mood) {
      count[t.mood] = (count[t.mood] || 0) + 1;
    }
  });
  return Object.keys(count)
    .map(key => ({ key, count: count[key] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

module.exports = {
  formatDate,
  toISODate,
  calcProgress,
  groupByCategory,
  recentTreasured,
  moodTop,
};
