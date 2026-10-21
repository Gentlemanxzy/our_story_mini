/**
 * 分类数据层
 *
 * 模型约定：
 *   - 内置 10 个分类：key 为固定英文串（youth/together/...），名称只读、不可删
 *   - 自定义分类：key 为 `c_xxx`，名称可改、可删（仅当分类下没有条目时）
 *
 * 为什么单独存一张表，而不是只把名字写进 things.category：
 *   1. 新建了分类但还没加条目时，分类不能消失（否则选择器里看不到）
 *   2. 重命名只需要改这条记录，不用批量更新所有 things
 *
 * 接云时只需改这一个文件：
 *   list()   → db.collection('categories').where({ coupleId }).get()
 *   create() → wx.cloud.callFunction({ name: 'category_upsert' })
 * 页面层不需要改动。
 */
const { CATEGORIES } = require('../constants');

const STORAGE_KEY = 'ourstory.categories.v1';

function uid() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function readStore() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function writeStore(list) {
  wx.setStorageSync(STORAGE_KEY, list);
}

function normalize(name) {
  return String(name || '').trim().slice(0, 8);
}

/** 内置分类（只读） */
function builtins() {
  return CATEGORIES.map((c, i) => ({
    key: c.key,
    name: c.name,
    order: (i + 1) * 1000,
    isDefault: true,
    editable: false,
  }));
}

/** 全部内置分类名，用于新建时查重 */
function allNames(customList) {
  return builtins()
    .map(c => c.name)
    .concat(customList.map(c => c.name));
}

/** 分类列表：内置在前，自定义按创建顺序在后 */
function list() {
  return new Promise(resolve => {
    const custom = readStore()
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(c => ({
        key: c.key,
        name: c.name,
        order: c.order,
        isDefault: false,
        editable: true,
      }));
    resolve(builtins().concat(custom));
  });
}

/** 新建自定义分类，返回 { ok, item?, reason? } */
function create(rawName) {
  return new Promise(resolve => {
    const name = normalize(rawName);
    if (!name) {
      resolve({ ok: false, reason: 'EMPTY' });
      return;
    }

    const custom = readStore();
    if (allNames(custom).indexOf(name) > -1) {
      resolve({ ok: false, reason: 'DUP' });
      return;
    }
    if (custom.length >= 30) {
      resolve({ ok: false, reason: 'LIMIT' });
      return;
    }

    const maxOrder = custom.reduce((m, c) => Math.max(m, c.order || 0), 10000);
    const item = {
      key: uid(),
      name,
      order: maxOrder + 1000,
      createdAt: new Date().toISOString(),
    };
    custom.push(item);
    writeStore(custom);
    resolve({ ok: true, item });
  });
}

/** 重命名（仅自定义分类） */
function rename(key, rawName) {
  return new Promise(resolve => {
    const name = normalize(rawName);
    if (!name) {
      resolve({ ok: false, reason: 'EMPTY' });
      return;
    }

    const custom = readStore();
    const idx = custom.findIndex(c => c.key === key);
    if (idx === -1) {
      resolve({ ok: false, reason: 'NOT_FOUND' });
      return;
    }

    const dup = allNames(custom.filter(c => c.key !== key)).indexOf(name) > -1;
    if (dup) {
      resolve({ ok: false, reason: 'DUP' });
      return;
    }

    custom[idx].name = name;
    custom[idx].updatedAt = new Date().toISOString();
    writeStore(custom);
    resolve({ ok: true, item: custom[idx] });
  });
}

/** 删除（仅自定义分类；调用方需先确认分类下没有条目） */
function remove(key) {
  return new Promise(resolve => {
    const custom = readStore();
    const next = custom.filter(c => c.key !== key);
    if (next.length === custom.length) {
      resolve({ ok: false, reason: 'NOT_FOUND' });
      return;
    }
    writeStore(next);
    resolve({ ok: true });
  });
}

module.exports = {
  list,
  create,
  rename,
  remove,
};
