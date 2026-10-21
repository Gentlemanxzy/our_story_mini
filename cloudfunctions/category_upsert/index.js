/**
 * category_upsert · 写入 / 更新自定义分类
 * 内置 10 个分类不入库，只存用户自建的。
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
    // 忽略
  }
  return { coupleId: `solo_${openid}`, members: [openid] };
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: 'no openid' };

  const item = event.item;
  const key = String((item && item.key) || '');
  if (!key) return { ok: false, msg: 'no key' };

  const scope = await scopeOf(OPENID);
  const col = db.collection('categories');

  try {
    const existing = await col
      .doc(key)
      .get()
      .catch(() => null);
    if (existing && existing.data && existing.data.coupleId !== scope.coupleId) {
      return { ok: false, msg: 'forbidden' };
    }
  } catch (e) {
    // 忽略
  }

  const now = new Date();
  await col.doc(key).set({
    data: {
      coupleId: scope.coupleId,
      members: scope.members,
      key,
      name: String(item.name || '').slice(0, 8),
      order: Number(item.order) || 0,
      deleted: !!item.deleted,
      createdBy: item.createdBy || OPENID,
      updatedBy: OPENID,
      createdAt: item.createdAt ? new Date(item.createdAt) : now,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : now,
    },
  });

  return { ok: true, coupleId: scope.coupleId };
};
