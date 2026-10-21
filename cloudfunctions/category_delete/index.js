/**
 * category_delete · 软删自定义分类
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
    if (r.data.length) return r.data[0]._id;
  } catch (e) {
    // 忽略
  }
  return `solo_${openid}`;
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  const key = String(event.key || '');
  if (!OPENID || !key) return { ok: false, msg: 'bad request' };

  try {
    const doc = await db
      .collection('categories')
      .doc(key)
      .get();

    const coupleId = await scopeOf(OPENID);
    if (!doc.data || doc.data.coupleId !== coupleId) {
      return { ok: false, msg: 'forbidden' };
    }

    await db
      .collection('categories')
      .doc(key)
      .update({
        data: { deleted: true, updatedBy: OPENID, updatedAt: new Date() },
      });

    return { ok: true };
  } catch (e) {
    return { ok: true, note: 'not found' };
  }
};
