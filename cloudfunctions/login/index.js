/**
 * login · 取 openid 并落一条 users 记录
 *
 * 注意：云函数写入不会自动补 `_openid`（只有小程序端写入才自动加），
 * 所以这里必须显式写入，否则 users 集合的安全规则匹配不上。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const users = db.collection('users');

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, msg: 'no openid' };
  }

  try {
    const found = await users.where({ _openid: OPENID }).limit(1).get();

    if (!found.data.length) {
      await users.add({
        data: {
          _openid: OPENID,
          nickName: '',
          avatarFileID: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return {
      ok: true,
      openid: OPENID,
      appid: APPID,
      unionid: UNIONID || '',
      isNew: !found.data.length,
    };
  } catch (e) {
    // users 集合未创建时会走到这里
    return { ok: false, msg: e.message || 'login failed' };
  }
};
