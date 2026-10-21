/**
 * 清单数据访问层 —— 本地优先 + 云端同步 + 失败兜底
 *
 * 读写策略：
 *   读：只读本地缓存（快、离线可用，不会因为云端慢而卡界面）
 *   写：先写本地 → 入待传队列 → 后台推云；推成功才出队
 *   兜底：推失败就留在队列里，下次 flush() 补传；数据始终以本地为准
 *   拉取：pull() 把云端数据按 updatedAt 较新者合并进本地（换手机恢复用）
 *
 * 删除用软删（deleted: true）保留墓碑，否则 pull 时会把已删条目复活。
 * 编号 no 是派生字段：读的时候按 order 重新编号，不入库、无需同步。
 */
const { DEFAULT_THINGS } = require('../data/default-things');
const cloud = require('../utils/cloud');

const CACHE_KEY = 'ourstory.things.v1';
const QUEUE_KEY = 'ourstory.things.queue.v1';
const MAX_QUEUE = 400;

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function byOrder(a, b) {
  return (a.order || 0) - (b.order || 0);
}

function readCache() {
  try {
    const v = wx.getStorageSync(CACHE_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function writeCache(list) {
  try {
    wx.setStorageSync(CACHE_KEY, list);
  } catch (e) {
    // 存储写失败不阻塞界面
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

function clone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return v;
  }
}

/** 入队；同 key 覆盖，保证「先改后删」只留最后一次操作。写入时取快照，避免后续改动污染队列 */
function enqueue(entry) {
  const q = readQueue().filter(e => e.key !== entry.key);
  q.push(Object.assign({ at: Date.now() }, entry));
  writeQueue(clone(q.slice(-MAX_QUEUE)));
}

function dequeue(key) {
  writeQueue(readQueue().filter(e => e.key !== key));
}

/** 编号按 order 重排，删除项不参与 */
function withNumbers(list) {
  const visible = list.filter(t => !t.deleted).sort(byOrder);
  visible.forEach((t, i) => {
    t.no = i + 1;
  });
  return visible;
}

function makeItem(source, index) {
  return Object.assign(
    {
      _id: uid() + (index || ''),
      title: '',
      category: '',
      status: 'want',
      doneDate: '',
      mood: '',
      note: '',
      photos: [],
      createdBy: '',
      isDefault: false,
      deleted: false,
      order: 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
    source
  );
}

/** 首次进入：本地生成初始清单，并整批入队等待上传 */
function seedDefaults() {
  const list = DEFAULT_THINGS.map((t, i) =>
    makeItem(
      {
        title: t.title,
        category: t.category,
        isDefault: true,
        order: t.order,
      },
      i
    )
  );
  writeCache(list);
  enqueue({ key: 'thing:__seed__', kind: 'thing', op: 'upsert', items: list });
  return list;
}

function load() {
  const raw = readCache();
  return raw.length ? raw : seedDefaults();
}

/* ── 云端推送 ── */

function pushEntry(entry) {
  if (entry.op === 'delete') {
    return cloud.call('thing_delete', { id: entry.targetId });
  }
  if (entry.items) {
    return cloud.call('thing_upsert', { items: entry.items });
  }
  return cloud.call('thing_upsert', { item: entry.item });
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

/** 把待传队列依次推上去；遇到失败停在原地，下次继续 */
async function flush() {
  cloud.reset();
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

/** 待同步条数（批量条目按实际条数计） */
function pendingCount() {
  return readQueue().reduce((n, e) => n + (e.items ? e.items.length : 1), 0);
}

/* ── 拉取合并 ── */

function toISO(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function fromRemote(r) {
  return {
    _id: r._id,
    title: r.title || '',
    category: r.category || '',
    status: r.status || 'want',
    doneDate: r.doneDate || '',
    mood: r.mood || '',
    note: r.note || '',
    photos: Array.isArray(r.photos) ? r.photos : [],
    createdBy: r.createdBy || '',
    isDefault: !!r.isDefault,
    deleted: !!r.deleted,
    order: Number(r.order) || 0,
    createdAt: toISO(r.createdAt),
    updatedAt: toISO(r.updatedAt),
  };
}

/**
 * 云端 → 本地合并。
 * 同 _id 取 updatedAt 较新者；本地尚未上传的改动 updatedAt 最新，不会被覆盖。
 * 云端不可用时静默返回，本地数据不动。
 */
async function pull() {
  try {
    const res = await cloud.call('sync_pull', {});
    const remote = (res && res.things) || [];
    if (!remote.length) return { ok: true, merged: 0 };

    const map = new Map();
    readCache().forEach(t => map.set(t._id, t));

    remote.forEach(r => {
      const local = map.get(r._id);
      const newer = !local || String(r.updatedAt || '') > String(local.updatedAt || '');
      if (newer) map.set(r._id, fromRemote(r));
    });

    const merged = Array.from(map.values());
    writeCache(merged);
    return { ok: true, merged: merged.length };
  } catch (e) {
    return { ok: false, merged: 0 };
  }
}

/* ── 对外接口 ── */

function list(options = {}) {
  return new Promise(resolve => {
    let data = withNumbers(load());

    if (options.category) {
      data = data.filter(t => t.category === options.category);
    }
    const kw = String(options.keyword || '').trim();
    if (kw) {
      data = data.filter(
        t => (t.title || '').indexOf(kw) > -1 || (t.note || '').indexOf(kw) > -1
      );
    }
    resolve(data);
  });
}

function upsert(patch) {
  return new Promise(resolve => {
    const store = load();
    const idx = store.findIndex(t => t._id === patch._id);
    let item;

    if (idx > -1) {
      item = Object.assign({}, store[idx], patch, { updatedAt: nowISO() });
      store[idx] = item;
    } else {
      const maxOrder = store.reduce((m, t) => Math.max(m, t.order || 0), 0);
      const draft = Object.assign({}, patch);
      delete draft._id; // 新建时 _id 由本地生成，避免外部传入 undefined 覆盖
      item = makeItem(Object.assign(draft, { order: maxOrder + 1000, deleted: false }));
      store.push(item);
    }

    writeCache(store);

    // 先记账再推云：即使推云失败，界面和队列都已经是正确的
    const key = `thing:${item._id}`;
    enqueue({ key, kind: 'thing', op: 'upsert', item });
    flushKey(key).catch(() => {});

    resolve(withNumbers(store));
  });
}

function remove(id) {
  return new Promise(resolve => {
    const store = load();
    const idx = store.findIndex(t => t._id === id);
    if (idx > -1) {
      store[idx] = Object.assign({}, store[idx], { deleted: true, updatedAt: nowISO() });
      writeCache(store);

      const key = `thing:${id}`;
      enqueue({ key, kind: 'thing', op: 'delete', targetId: id });
      flushKey(key).catch(() => {});
    }
    resolve(withNumbers(store));
  });
}

/** 从默认库批量加入（按标题去重），合并成一次请求上传 */
function seedFromDefaults(indexes) {
  return new Promise(resolve => {
    const store = load();
    const exist = new Set(store.filter(t => !t.deleted).map(t => t.title));
    let maxOrder = store.reduce((m, t) => Math.max(m, t.order || 0), 0);
    const added = [];

    indexes.forEach(i => {
      const d = DEFAULT_THINGS[i];
      if (!d || exist.has(d.title)) return;
      maxOrder += 1000;
      const item = makeItem(
        {
          title: d.title,
          category: d.category,
          isDefault: true,
          order: maxOrder,
        },
        i
      );
      store.push(item);
      added.push(item);
    });

    if (added.length) {
      writeCache(store);
      const key = 'thing:__seed__';
      const prev = readQueue().find(e => e.key === key);
      const items = (prev && prev.items ? prev.items : []).concat(added);
      enqueue({ key, kind: 'thing', op: 'upsert', items });
      flushKey(key).catch(() => {});
    }

    resolve(withNumbers(store));
  });
}

function reset() {
  const old = readCache();
  // 给旧条目立墓碑，否则清空后下一次 pull 会把云端那份又合并回来
  const tombstones = old
    .filter(t => !t.deleted)
    .map(t => ({ _id: t._id, deleted: true, updatedAt: nowISO() }));

  try {
    wx.removeStorageSync(CACHE_KEY);
  } catch (e) {
    // 忽略
  }
  // 清掉清单相关的待传项，避免把旧 _id 推到云端变成孤儿记录
  writeQueue(readQueue().filter(e => e.kind !== 'thing'));

  const list = seedDefaults();

  if (tombstones.length) {
    enqueue({ key: 'thing:__reset__', kind: 'thing', op: 'upsert', items: tombstones });
    flushKey('thing:__reset__').catch(() => {});
  }

  return Promise.resolve(withNumbers(list));
}

module.exports = {
  list,
  upsert,
  remove,
  seedFromDefaults,
  reset,
  flush,
  pull,
  pendingCount,
};
