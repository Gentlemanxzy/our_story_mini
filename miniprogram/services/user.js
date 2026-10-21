/**
 * 个人资料（昵称 / 头像）
 *
 * 头像链路：
 *   chooseAvatar 拿到的是【临时路径】，约 24 小时后失效
 *     → 优先 wx.cloud.uploadFile 转成 fileID（长期有效、换手机也在）
 *     → 云不可用时落盘到 USER_DATA_PATH（本机长期有效，重装会丢）
 *     → 都失败才退回临时路径（仅本次会话可见）
 *
 * 已登录时把昵称/头像同步到 users 集合（user_update 云函数）。
 */
const auth = require('../utils/auth');

const PROFILE_KEY = 'ourstory.user.v1';

const DEFAULT_PROFILE = {
  nickName: '',
  avatar: '',
  avatarWhere: '', // cloud | local | temp
  updatedAt: '',
};

function readStore() {
  try {
    const v = wx.getStorageSync(PROFILE_KEY);
    return v && typeof v === 'object' ? v : Object.assign({}, DEFAULT_PROFILE);
  } catch (e) {
    return Object.assign({}, DEFAULT_PROFILE);
  }
}

function writeStore(v) {
  wx.setStorageSync(PROFILE_KEY, v);
}

function extOf(path) {
  const m = String(path).match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'png';
}

/** 把头像落盘，返回 { src, where } */
function persistAvatar(tempFilePath) {
  return new Promise(resolve => {
    const ext = extOf(tempFilePath);

    const saveLocal = () => {
      try {
        const fs = wx.getFileSystemManager();
        const filePath = `${wx.env.USER_DATA_PATH}/avatar_${Date.now()}.${ext}`;
        fs.saveFile({
          tempFilePath,
          filePath,
          success: r => resolve({ src: r.savedFilePath, where: 'local' }),
          fail: () => resolve({ src: tempFilePath, where: 'temp' }),
        });
      } catch (e) {
        resolve({ src: tempFilePath, where: 'temp' });
      }
    };

    if (!wx.cloud) {
      saveLocal();
      return;
    }

    wx.cloud
      .uploadFile({
        cloudPath: `avatar/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
        filePath: tempFilePath,
      })
      .then(res => resolve({ src: res.fileID, where: 'cloud' }))
      .catch(() => saveLocal());
  });
}

/** 删掉上一张本地头像，避免 USER_DATA_PATH 堆垃圾 */
function cleanupOldLocal(oldSrc, newSrc) {
  if (!oldSrc || oldSrc === newSrc) return;
  if (oldSrc.indexOf('cloud://') === 0) return;
  if (oldSrc.indexOf(wx.env.USER_DATA_PATH) !== 0) return;
  try {
    wx.getFileSystemManager().unlink({ filePath: oldSrc, fail: () => {} });
  } catch (e) {
    // 清理失败无所谓
  }
}

function getProfile() {
  return Promise.resolve(readStore());
}

async function saveProfile(patch) {
  const prev = readStore();
  const next = Object.assign({}, prev, patch, { updatedAt: new Date().toISOString() });
  writeStore(next);

  if (patch.avatar) {
    cleanupOldLocal(prev.avatar, patch.avatar);
  }

  // 同步云端：只有已登录、且头像是云文件时才推，本地路径推上去没意义
  const st = auth.getState();
  if (st.cloudOk && wx.cloud) {
    const data = { nickName: next.nickName || '' };
    if (next.avatar && next.avatar.indexOf('cloud://') === 0) {
      data.avatarFileID = next.avatar;
    }
    try {
      await wx.cloud.callFunction({ name: 'user_update', data });
    } catch (e) {
      // user_update 未部署时静默跳过，本地已保存
      console.warn('[user] 云端资料同步失败（本地已保存）：', e && e.errMsg);
    }
  }

  return next;
}

module.exports = {
  getProfile,
  saveProfile,
  persistAvatar,
};
