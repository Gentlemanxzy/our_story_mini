/**
 * thing_delete · 软删清单条目
 *
 * 保留 deleted:true 墓碑而不是物理删除：
 * 否则另一端 pull 合并时会把条目当成「本地独有」而复活。
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
  const id = String(event.id || '');
  if (!OPENID || !id) return { ok: false, msg: 'bad request' };

  try {
    const doc = await db
      .collection('things')
      .doc(id)
      .get();

    const coupleId = await scopeOf(OPENID);
    if (!doc.data || doc.data.coupleId !== coupleId) {
      return { ok: false, msg: 'forbidden' };
    }

    await db
      .collection('things')
      .doc(id)
      .update({
        data: { deleted: true, updatedBy: OPENID, updatedAt: new Date() },
      });

    return { ok: true };
  } catch (e) {
    // 文档不存在视为已删除，避免队列里反复重试
    return { ok: true, note: 'not found' };
  }
};
