const thingsSvc = require('../../services/things');
const userSvc = require('../../services/user');
const auth = require('../../utils/auth');

Page({
  data: {
    nickName: '',
    avatar: '',
    initial: '我',
    bound: false,
    cloudOk: false,
    statusText: '',
    footText: '',
    counts: { total: 0, done: 0 },
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const [all, profile, loginState] = await Promise.all([
      thingsSvc.list(),
      userSvc.getProfile(),
      auth.ensureLogin(),
    ]);

    const nickName = profile.nickName || '';
    const cloudOk = loginState.cloudOk;

    this.setData({
      nickName,
      avatar: profile.avatar || '',
      initial: nickName ? nickName.slice(0, 1) : '我',
      cloudOk,
      statusText: cloudOk ? '单人模式' : '本地模式',
      footText: cloudOk
        ? `已连接云端 · openid ${loginState.openid.slice(0, 6)}…`
        : '未连接云端，数据只存在这台手机',
      counts: {
        total: all.length,
        done: all.filter(t => t.status === 'treasured').length,
      },
    });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  goManage() {
    wx.navigateTo({ url: '/pages/things-manage/things-manage' });
  },

  goBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },

  onReset() {
    wx.showModal({
      title: '重新体验首次引导',
      content: '会清空当前设备上的清单与打卡记录，恢复到初始的默认清单。头像昵称不受影响。确定吗？',
      confirmText: '确定清空',
      confirmColor: '#C2603F',
      success: async res => {
        if (!res.confirm) return;
        await thingsSvc.reset();
        await this.refresh();
        wx.showToast({ title: '已恢复初始清单', icon: 'none' });
      },
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于',
      content: '情侣「100 件小事」打卡手账\n两个人一起，把日子过成章节。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#C2603F',
    });
  },
});
