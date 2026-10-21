const thingsSvc = require('../../services/things');
const categoriesSvc = require('../../services/categories');
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
    pending: 0,
    syncing: false,
    counts: { total: 0, done: 0 },
  },

  onShow() {
    // 先出界面（只读本地），再后台同步，避免云端慢时卡住页面
    this.render();
    this.sync();
  },

  async render() {
    const [all, profile, loginState] = await Promise.all([
      thingsSvc.list(),
      userSvc.getProfile(),
      auth.ensureLogin(),
    ]);

    const nickName = profile.nickName || '';
    const cloudOk = loginState.cloudOk;
    const pending = thingsSvc.pendingCount() + categoriesSvc.pendingCount();

    let footText;
    if (this.data.syncing) {
      footText = '正在同步…';
    } else if (pending > 0) {
      footText = `本地已保存 · ${pending} 条待上传`;
    } else if (cloudOk) {
      footText = '已与云端同步';
    } else {
      footText = '本地模式 · 数据只在这台手机';
    }

    this.setData({
      nickName,
      avatar: profile.avatar || '',
      initial: nickName ? nickName.slice(0, 1) : '我',
      cloudOk,
      pending,
      statusText: cloudOk ? '单人模式' : '本地模式',
      footText,
      counts: {
        total: all.length,
        done: all.filter(t => t.status === 'treasured').length,
      },
    });
  },

  /** 拉云端 + 推待传队列；失败不抛出，本地数据不受影响 */
  async sync() {
    await thingsSvc.pull();
    await thingsSvc.flush();
    await categoriesSvc.pull();
    await categoriesSvc.flush();
  },

  async onSyncTap() {
    if (this.data.syncing) return;
    this.setData({ syncing: true, footText: '正在同步…' });

    await this.sync();

    this.setData({ syncing: false });
    await this.render();

    const pending = this.data.pending;
    wx.showToast({
      title: pending === 0 ? '已与云端一致' : `还有 ${pending} 条待上传`,
      icon: 'none',
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
      content: '会清空清单并同步删除云端对应记录，恢复到初始的默认清单。头像昵称不受影响。确定吗？',
      confirmText: '确定清空',
      confirmColor: '#C2603F',
      success: async res => {
        if (!res.confirm) return;
        await thingsSvc.reset();
        await this.render();
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
