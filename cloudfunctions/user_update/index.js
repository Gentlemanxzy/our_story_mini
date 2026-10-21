/**
 * user_update · 保存昵称与头像
 *
 * 只接受 cloud:// 的 fileID：本地路径（wxfile:// / USER_DATA_PATH）推上来在别的设备打不开。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, msg: 'no openid' };
  }

  const patch = { updatedAt: new Date() };

  if (typeof event.nickName === 'string') {
    patch.nickName = event.nickName.trim().slice(0, 20);
  }

  if (typeof event.avatarFileID === 'string' && event.avatarFileID.indexOf('cloud://') === 0) {
    patch.avatarFileID = event.avatarFileID;
  }

  try {
    const users = db.collection('users');
    const found = await users.where({ _openid: OPENID }).limit(1).get();

    if (!found.data.length) {
      await users.add({
        data: Object.assign(
          {
            _openid: OPENID,
            nickName: '',
            avatarFileID: '',
            createdAt: new Date(),
          },
          patch
        ),
      });
    } else {
      await users.doc(found.data[0]._id).update({ data: patch });
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message || 'update failed' };
  }
};
