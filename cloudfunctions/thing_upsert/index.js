/**
 * thing_upsert · 写入 / 更新清单条目（支持单条与批量）
 *
 * 作用域由服务端按 openid 推导，客户端不能指定：
 *   已绑定 → 用 couples 的 _id 作为 coupleId
 *   未绑定 → solo_<openid>
 *
 * 安全：写入前校验目标文档的 coupleId，防止用别人猜到的 _id 覆盖对方数据。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function scopeOf(openid) {
  try {
    const r = await db
      .collection('couples')
      .where({ members: openid, status: 'bound' })
      .limit(1)
      .get();
    if (r.data.length) {
      return { coupleId: r.data[0]._id, members: r.data[0].members || [openid] };
    }
  } catch (e) {
    // couples 集合还没建时按单人空间处理
  }
  return { coupleId: `solo_${openid}`, members: [openid] };
}

function pick(item, scope, openid) {
  const now = new Date();
  return {
    coupleId: scope.coupleId,
    members: scope.members,
    title: String(item.title || '').slice(0, 60),
    category: String(item.category || ''),
    status: item.status || 'want',
    doneDate: item.doneDate || '',
    mood: item.mood || '',
    note: String(item.note || '').slice(0, 140),
    photos: Array.isArray(item.photos) ? item.photos.slice(0, 9) : [],
    createdBy: item.createdBy || openid,
    updatedBy: openid,
    isDefault: !!item.isDefault,
    order: Number(item.order) || 0,
    deleted: !!item.deleted,
    createdAt: item.createdAt ? new Date(item.createdAt) : now,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : now,
  };
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: 'no openid' };

  const items = event.items || (event.item ? [event.item] : []);
  if (!items.length) return { ok: false, msg: 'empty' };

  const scope = await scopeOf(OPENID);
  const col = db.collection('things');
  let count = 0;

  for (const item of items) {
    const id = String((item && item._id) || '');
    if (!id) continue;

    const existing = await col
      .doc(id)
      .get()
      .catch(() => null);
    if (existing && existing.data && existing.data.coupleId !== scope.coupleId) {
      continue; // 不属于当前作用域，跳过
    }

    await col.doc(id).set({ data: pick(item, scope, OPENID) });
    count += 1;
  }

  return { ok: true, count, coupleId: scope.coupleId };
};
