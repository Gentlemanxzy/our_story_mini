/**
 * 登录态
 *
 * 说明：小程序拿 openid 不需要用户授权，也不需要 wx.login 换 code ——
 * 云函数里 cloud.getWXContext().OPENID 直接就有。所以「登录」对用户是无感的。
 *
 * 头像昵称是另一回事：wx.getUserProfile 已于 2022-10-25 被回收，
 * 必须由用户通过「头像昵称填写能力」主动确认，见 pages/profile-edit。
 */
const OPENID_KEY = 'ourstory.openid.v1';

let state = {
  openid: '',
  checked: false,
  cloudOk: false,
  reason: '',
};

function readCache() {
  try {
    return wx.getStorageSync(OPENID_KEY) || '';
  } catch (e) {
    return '';
  }
}

function getState() {
  return state;
}

/**
 * 确保拿到 openid。
 * 失败不抛异常、不弹窗，只把 cloudOk 置 false，让界面走本地模式。
 */
async function ensureLogin(force) {
  if (state.checked && !force) return state;

  const cached = readCache();
  if (cached && !force) {
    state = { openid: cached, checked: true, cloudOk: true, reason: 'cache' };
    return state;
  }

  if (!wx.cloud) {
    state = { openid: '', checked: true, cloudOk: false, reason: 'no_cloud' };
    return state;
  }

  try {
    const res = await wx.cloud.callFunction({ name: 'login' });
    const r = (res && res.result) || {};

    if (r.ok && r.openid) {
      state = { openid: r.openid, checked: true, cloudOk: true, reason: 'cloud' };
      try {
        wx.setStorageSync(OPENID_KEY, r.openid);
      } catch (e) {
        // 缓存失败不影响登录态
      }
    } else {
      state = { openid: '', checked: true, cloudOk: false, reason: r.msg || 'login_failed' };
    }
  } catch (e) {
    // 常见原因：login 云函数还没部署、云环境 ID 不对、网络不通
    state = { openid: '', checked: true, cloudOk: false, reason: 'call_failed' };
    console.warn('[auth] 未连上云环境，进入本地模式：', e && e.errMsg);
  }

  return state;
}

module.exports = {
  ensureLogin,
  getState,
};
