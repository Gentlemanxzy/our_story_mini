/**
 * sync_pull · 一次拉齐当前作用域下的清单与分类
 *
 * 客户端在启动 / 进入「我的」时调用，按 updatedAt 较新者合并进本地缓存。
 * 删除过的条目也会返回（deleted:true 墓碑），否则会被本地误判为「新增」而复活。
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

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: 'no openid' };

  const coupleId = await scopeOf(OPENID);

  let things = [];
  let categories = [];

  try {
    const r = await db
      .collection('things')
      .where({ coupleId })
      .orderBy('order', 'asc')
      .limit(1000)
      .get();
    things = r.data;
  } catch (e) {
    // things 集合未建时返回空，客户端继续用本地数据
  }

  try {
    const r = await db
      .collection('categories')
      .where({ coupleId })
      .orderBy('order', 'asc')
      .limit(500)
      .get();
    categories = r.data;
  } catch (e) {
    // 同上
  }

  return { ok: true, coupleId, things, categories };
};
