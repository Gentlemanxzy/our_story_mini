const { ENV_ID } = require('./config');

App({
  globalData: {
    openid: '',
    userInfo: null,
    coupleId: '',
    members: [],
    // 云端接入前先用本地数据跑通界面
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
});
