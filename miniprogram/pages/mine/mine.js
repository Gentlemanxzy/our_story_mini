const thingsSvc = require('../../services/things');

Page({
  data: {
    bound: false,
    nickName: '',
    myCode: '',
    counts: { total: 0, done: 0 },
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const all = await thingsSvc.list();
    this.setData({
      counts: {
        total: all.length,
        done: all.filter(t => t.status === 'treasured').length,
      },
    });
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
      content: '会清空当前设备上的清单与打卡记录，恢复到初始的默认清单。确定吗？',
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
