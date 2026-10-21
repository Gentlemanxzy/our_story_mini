const userSvc = require('../../services/user');

Page({
  data: {
    avatar: '',
    avatarWhere: '',
    nickName: '',
    saving: false,
  },

  onLoad() {
    this.load();
  },

  async load() {
    const p = await userSvc.getProfile();
    this.setData({
      avatar: p.avatar || '',
      avatarWhere: p.avatarWhere || '',
      nickName: p.nickName || '',
    });
  },

  /**
   * 头像昵称填写能力：用户点头像后，微信面板里可以直接选「用微信头像」。
   * 基础库 2.24.4 起，图片未通过安全检测不会触发该事件。
   */
  async onChooseAvatar(e) {
    const temp = e.detail.avatarUrl;
    if (!temp) {
      wx.showToast({ title: '这张图换不了，换一张试试', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '换个头像', mask: true });
    const r = await userSvc.persistAvatar(temp);
    wx.hideLoading();
    this.setData({ avatar: r.src, avatarWhere: r.where });
  },

  onNickInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const nick = String(this.data.nickName || '').trim();
    if (!nick) {
      wx.showToast({ title: '先起个名字吧', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    await userSvc.saveProfile({
      nickName: nick,
      avatar: this.data.avatar,
      avatarWhere: this.data.avatarWhere,
    });
    this.setData({ saving: false });
    wx.showToast({ title: '已保存', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 600);
  },
});
