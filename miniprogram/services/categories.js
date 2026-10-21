/**
 * 分类数据层 —— 与清单同一套「本地优先 + 云端同步 + 失败兜底」策略
 *
 * 模型约定：
 *   - 内置 10 个分类：key 固定（youth/together/...），只读，不入库
 *   - 自定义分类：key 为 `c_xxx`，可改名、可删（仅当分类下没有条目时）
 *
 * 单独存一份而不是只把名字写进 things.category 的原因：
 *   1. 新建了分类但还没加条目时，分类不能消失
 *   2. 改名只改这一条，不用批量更新所有 things
 */
const { CATEGORIES } = require('../constants');
const cloud = require('../utils/cloud');

const STORAGE_KEY = 'ourstory.categories.v1';
const QUEUE_KEY = 'ourstory.categories.queue.v1';
const MAX_CUSTOM = 30;

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function readStore() {
  try {
    const v = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function writeStore(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list);
  } catch (e) {
    // 忽略
  }
}

function readQueue() {
  try {
    const v = wx.getStorageSync(QUEUE_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(q) {
  try {
    wx.setStorageSync(QUEUE_KEY, q);
  } catch (e) {
    // 忽略
  }
}

function enqueue(entry) {
  const q = readQueue().filter(e => e.key !== entry.key);
  q.push(Object.assign({ at: Date.now() }, entry));
  writeQueue(q.slice(-100));
}

function dequeue(key) {
  writeQueue(readQueue().filter(e => e.key !== key));
}

function normalize(name) {
  return String(name || '').trim().slice(0, 8);
}

/** 内置分类（只读，不落库） */
function builtins() {
  return CATEGORIES.map((c, i) => ({
    key: c.key,
    name: c.name,
    order: (i + 1) * 1000,
    isDefault: true,
    editable: false,
  }));
}

function customs() {
  return readStore()
    .filter(c => !c.deleted)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function allNames(exceptKey) {
  return builtins()
    .map(c => c.name)
    .concat(customs().filter(c => c.key !== exceptKey).map(c => c.name));
}

/* ── 云端推送 ── */

function pushEntry(entry) {
  if (entry.op === 'delete') {
    return cloud.call('category_delete', { key: entry.targetId });
  }
  return cloud.call('category_upsert', { item: entry.item });
}

async function flushKey(key) {
  const entry = readQueue().find(e => e.key === key);
  if (!entry) return true;
  try {
    await pushEntry(entry);
    dequeue(key);
    return true;
  } catch (e) {
    return false;
  }
}

async function flush() {
  const q = readQueue();
  if (!q.length) return { ok: true, pushed: 0 };

  let pushed = 0;
  for (let i = 0; i < q.length; i += 1) {
    try {
      await pushEntry(q[i]);
      pushed += 1;
    } catch (e) {
      writeQueue(q.slice(i));
      return { ok: false, pushed };
    }
  }
  writeQueue([]);
  return { ok: true, pushed };
}

function pendingCount() {
  return readQueue().length;
}

/* ── 拉取合并 ── */

function toISO(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

async function pull() {
  try {
    const res = await cloud.call('sync_pull', {});
    const remote = (res && res.categories) || [];
    if (!remote.length) return { ok: true, merged: 0 };

    const map = new Map();
    readStore().forEach(c => map.set(c.key, c));

    remote.forEach(r => {
      const local = map.get(r.key);
      const newer = !local || String(r.updatedAt || '') > String(local.updatedAt || '');
      if (newer) {
        map.set(r.key, {
          key: r.key,
          name: r.name || '',
          order: Number(r.order) || 0,
          deleted: !!r.deleted,
          createdAt: toISO(r.createdAt),
          updatedAt: toISO(r.updatedAt),
        });
      }
    });

    writeStore(Array.from(map.values()));
    return { ok: true, merged: map.size };
  } catch (e) {
    return { ok: false, merged: 0 };
  }
}

/* ── 对外接口 ── */

function list() {
  return new Promise(resolve => {
    const custom = customs().map(c => ({
      key: c.key,
      name: c.name,
      order: c.order,
      isDefault: false,
      editable: true,
    }));
    resolve(builtins().concat(custom));
  });
}

function create(rawName) {
  return new Promise(resolve => {
    const name = normalize(rawName);
    if (!name) {
      resolve({ ok: false, reason: 'EMPTY' });
      return;
    }
    if (allNames().indexOf(name) > -1) {
      resolve({ ok: false, reason: 'DUP' });
      return;
    }

    const store = readStore();
    if (store.filter(c => !c.deleted).length >= MAX_CUSTOM) {
      resolve({ ok: false, reason: 'LIMIT' });
      return;
    }

    const maxOrder = store.reduce((m, c) => Math.max(m, c.order || 0), 10000);
    const item = {
      key: uid(),
      name,
      order: maxOrder + 1000,
      deleted: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    store.push(item);
    writeStore(store);

    const qkey = `cat:${item.key}`;
    enqueue({ key: qkey, kind: 'cat', op: 'upsert', item });
    flushKey(qkey).catch(() => {});

    resolve({ ok: true, item });
  });
}

function rename(key, rawName) {
  return new Promise(resolve => {
    const name = normalize(rawName);
    if (!name) {
      resolve({ ok: false, reason: 'EMPTY' });
      return;
    }
    if (allNames(key).indexOf(name) > -1) {
      resolve({ ok: false, reason: 'DUP' });
      return;
    }

    const store = readStore();
    const idx = store.findIndex(c => c.key === key);
    if (idx === -1) {
      resolve({ ok: false, reason: 'NOT_FOUND' });
      return;
    }

    store[idx] = Object.assign({}, store[idx], { name, updatedAt: nowISO() });
    writeStore(store);

    const item = store[idx];
    const qkey = `cat:${key}`;
    enqueue({ key: qkey, kind: 'cat', op: 'upsert', item });
    flushKey(qkey).catch(() => {});

    resolve({ ok: true, item });
  });
}

function remove(key) {
  return new Promise(resolve => {
    const store = readStore();
    const idx = store.findIndex(c => c.key === key);
    if (idx === -1) {
      resolve({ ok: false, reason: 'NOT_FOUND' });
      return;
    }

    // 软删保留墓碑，避免 pull 时被云端复活
    store[idx] = Object.assign({}, store[idx], { deleted: true, updatedAt: nowISO() });
    writeStore(store);

    const qkey = `cat:${key}`;
    enqueue({ key: qkey, kind: 'cat', op: 'delete', targetId: key });
    flushKey(qkey).catch(() => {});

    resolve({ ok: true });
  });
}

module.exports = {
  list,
  create,
  rename,
  remove,
  flush,
  pull,
  pendingCount,
};
