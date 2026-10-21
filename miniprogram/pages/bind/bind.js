const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'OURSTORY:BIND:';

Page({
  data: {
    code: '',
    myCode: '',
    // 云端函数未接入时，仅演示交互
    cloudReady: false,
  },

  onInput(e) {
    const v = String(e.detail.value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    this.setData({ code: v });
    return v;
  },

  /** 生成邀请码（接入云端后由 couple_create 云函数返回） */
  onGenerate() {
    let c = '';
    for (let i = 0; i < 6; i += 1) {
      c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    this.setData({ myCode: c });
  },

  onCopy() {
    if (!this.data.myCode) return;
    // 剪切板属于隐私接口，需在《用户隐私保护指引》中声明
    wx.setClipboardData({
      data: this.data.myCode,
      success: () => wx.showToast({ title: '已复制', icon: 'none' }),
    });
  },

  onScan() {
    wx.scanCode({
      scanType: ['qrCode'],
      success: res => {
        let raw = String(res.result || '').trim();
        if (raw.indexOf(PREFIX) === 0) raw = raw.slice(PREFIX.length);
        const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (code.length === 6) {
          this.setData({ code });
        } else {
          wx.showToast({ title: '不是有效的邀请码', icon: 'none' });
        }
      },
      fail: () => {},
    });
  },

  onSubmit() {
    const { code } = this.data;
    if (code.length !== 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '还需要一步',
      content: '绑定需要云端函数（couple_join）支持。当前项目已备好前端交互，接入云开发后即可真正绑定。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#C2603F',
    });
  },
});
