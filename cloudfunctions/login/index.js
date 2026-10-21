/**
 * login · 取 openid 并落一条 users 记录
 *
 * 注意两点：
 * 1. 云函数写入不会自动补 `_openid`（只有小程序端写入才自动加），
 *    所以这里必须显式写入，否则 users 集合的安全规则匹配不上。
 * 2. users 集合尚未创建时，openid 依然有效（身份不依赖这个集合），
 *    所以降级为「返回 openid + warn」，而不是整个登录失败——
 *    否则界面会误报「未连接云端」，掩盖真实原因。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, msg: 'no openid' };
  }

  let isNew = false;
  let warn = '';

  try {
    const users = db.collection('users');
    const found = await users.where({ _openid: OPENID }).limit(1).get();

    if (!found.data.length) {
      isNew = true;
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
  } catch (e) {
    // 集合未创建 / 权限异常：不影响身份，仅提示
    warn = e.message || 'users 记录写入失败';
  }

  return {
    ok: true,
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || '',
    isNew,
    warn,
  };
};
