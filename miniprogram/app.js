const { ENV_ID } = require('./config');
const thingsSvc = require('./services/things');
const categoriesSvc = require('./services/categories');

/** 前后台切换时触发同步的最小间隔 */
const SYNC_GAP = 30000;

App({
  globalData: {
    openid: '',
    userInfo: null,
    coupleId: '',
    members: [],
    cloudReady: false,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: ENV_ID,
      traceUser: true,
    });
    this.globalData.cloudReady = true;
  },

  /**
   * 回到前台时补一次同步：先拉云端，再把本地待传队列推上去。
   * 全部失败也不影响使用——本地缓存是完整的。
   */
  onShow() {
    const now = Date.now();
    if (now - (this._lastSync || 0) < SYNC_GAP) return;
    this._lastSync = now;

    thingsSvc
      .pull()
      .then(() => thingsSvc.flush())
      .then(() => categoriesSvc.pull())
      .then(() => categoriesSvc.flush())
      .catch(() => {});
  },
});
