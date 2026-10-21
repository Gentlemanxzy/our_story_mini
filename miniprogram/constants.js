/**
 * 全局枚举常量
 * 与《方案 v2》附录 A/B/C 一一对应，改动需同步文档与云端数据。
 */

// 附录 A · 分类
const CATEGORIES = [
  { key: 'youth', name: '青春日常' },
  { key: 'together', name: '两人一起' },
  { key: 'solo', name: '一个人的浪漫' },
  { key: 'faraway', name: '小小远方' },
  { key: 'passion', name: '关于热爱' },
  { key: 'brave', name: '勇敢一点' },
  { key: 'world', name: '感受世界' },
  { key: 'home', name: '居家烟火' },
  { key: 'ritual', name: '仪式感时刻' },
  { key: 'growup', name: '一起长大' },
];

const CATEGORY_MAP = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c.name;
  return acc;
}, {});

// 附录 B · 状态
const STATUSES = [
  { key: 'want', name: '想去做', tone: 'muted' },
  { key: 'waiting', name: '等待发生', tone: 'warm' },
  { key: 'treasured', name: '已经珍藏', tone: 'accent' },
  { key: 'later', name: '留给以后', tone: 'cool' },
];

const STATUS_MAP = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

// 附录 C · 心情（10 选 1）
const MOODS = [
  { key: 'heartbeat', name: '心动', glyph: '♡' },
  { key: 'happy', name: '开心', glyph: '☺' },
  { key: 'warm', name: '温暖', glyph: '☀' },
  { key: 'heal', name: '治愈', glyph: '✿' },
  { key: 'funny', name: '好笑', glyph: '☻' },
  { key: 'surprise', name: '惊喜', glyph: '✦' },
  { key: 'quiet', name: '安静', glyph: '☾' },
  { key: 'moved', name: '感动', glyph: '❀' },
  { key: 'proud', name: '骄傲', glyph: '★' },
  { key: 'teary', name: '想哭', glyph: '☂' },
];

const MOOD_MAP = MOODS.reduce((acc, m) => {
  acc[m.key] = m;
  return acc;
}, {});

// Lv 等级：按「百分比」而非绝对件数，兼容清单可增删
const LEVELS = [
  { lv: 1, min: 0, name: '序章' },
  { lv: 2, min: 20, name: '第一章' },
  { lv: 3, min: 40, name: '第二章' },
  { lv: 4, min: 60, name: '第三章' },
  { lv: 5, min: 80, name: '第四章' },
  { lv: 6, min: 100, name: '终章' },
];

module.exports = {
  CATEGORIES,
  CATEGORY_MAP,
  STATUSES,
  STATUS_MAP,
  MOODS,
  MOOD_MAP,
  LEVELS,
};
