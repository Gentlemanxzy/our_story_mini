/**
 * 清单数据访问层
 *
 * 当前为「本地存储」实现，接口已按云端形态设计成 Promise。
 * 接云时只需改这一个文件：
 *   - list()   → db.collection('things').where({ coupleId }).get()
 *   - upsert() → wx.cloud.callFunction({ name: 'thing_upsert' })
 *   - remove() → wx.cloud.callFunction({ name: 'thing_delete' })
 *   - watch()  → db.collection('things').where({coupleId}).watch()
 * 页面层不需要任何改动。
 *
 * 注意：写入必须走云函数（安全规则禁止客户端写），
 * 详见《方案 v2》第三节权限架构。
 */
const { DEFAULT_THINGS } = require('../data/default-things');
const { STORAGE_KEY } = require('../config');

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function readStore() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) && raw.length ? raw : null;
  } catch (e) {
    return null;
  }
}

function writeStore(list) {
  wx.setStorageSync(STORAGE_KEY, list);
}

/** 首次进入：从默认库灌入一份初始清单 */
function seed() {
  const list = DEFAULT_THINGS.map((t, i) => ({
    _id: uid() + i,
    no: i + 1,
    title: t.title,
    category: t.category,
    status: 'want',
    doneDate: '',
    mood: '',
    note: '',
    photos: [],
    createdBy: '',
    isDefault: true,
    order: t.order,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }));
  writeStore(list);
  return list;
}

/** 删除后重排编号，避免出现空号 */
function renumber(list) {
  return list.map((t, i) => Object.assign({}, t, { no: i + 1 }));
}

function load() {
  return readStore() || seed();
}

function sortByOrder(list) {
  return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** 列表（支持关键词与分类过滤） */
function list({ keyword = '', category = '' } = {}) {
  return new Promise(resolve => {
    let data = sortByOrder(load());
    if (category) {
      data = data.filter(t => t.category === category);
    }
    const kw = String(keyword).trim();
    if (kw) {
      data = data.filter(t => t.title.indexOf(kw) > -1 || (t.note || '').indexOf(kw) > -1);
    }
    resolve(data);
  });
}

/** 新增或更新（按 _id 判断） */
function upsert(patch) {
  return new Promise(resolve => {
    const store = sortByOrder(load());
    const idx = store.findIndex(t => t._id === patch._id);

    if (idx > -1) {
      store[idx] = Object.assign({}, store[idx], patch, { updatedAt: nowISO() });
    } else {
      const maxOrder = store.reduce((m, t) => Math.max(m, t.order || 0), 0);
      store.push(Object.assign({
        _id: uid(),
        no: store.length + 1,
        status: 'want',
        doneDate: '',
        mood: '',
        note: '',
        photos: [],
        createdBy: '',
        isDefault: false,
        order: maxOrder + 1000,
        createdAt: nowISO(),
      }, patch, { updatedAt: nowISO() }));
    }

    const next = renumber(store);
    writeStore(next);
    resolve(next);
  });
}

/** 删除 */
function remove(id) {
  return new Promise(resolve => {
    const next = renumber(sortByOrder(load()).filter(t => t._id !== id));
    writeStore(next);
    resolve(next);
  });
}

/** 从默认库批量加入（按标题去重） */
function seedFromDefaults(indexes) {
  return new Promise(resolve => {
    const store = sortByOrder(load());
    const exist = new Set(store.map(t => t.title));
    let maxOrder = store.reduce((m, t) => Math.max(m, t.order || 0), 0);

    indexes.forEach(i => {
      const d = DEFAULT_THINGS[i];
      if (!d || exist.has(d.title)) return;
      maxOrder += 1000;
      store.push({
        _id: uid() + i,
        no: store.length + 1,
        title: d.title,
        category: d.category,
        status: 'want',
        doneDate: '',
        mood: '',
        note: '',
        photos: [],
        createdBy: '',
        isDefault: true,
        order: maxOrder,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    });

    const next = renumber(store);
    writeStore(next);
    resolve(next);
  });
}

/** 清空本地演示数据，用于重新体验首次引导 */
function reset() {
  wx.removeStorageSync(STORAGE_KEY);
  return Promise.resolve(seed());
}

module.exports = {
  list,
  upsert,
  remove,
  seedFromDefaults,
  reset,
};
