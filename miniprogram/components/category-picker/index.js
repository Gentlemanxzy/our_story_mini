Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    list: { type: Array, value: [] },
    value: { type: String, value: '' },
    // 直接进入「新建分类」输入态，用于「管理分类 → 新建」入口
    startInCreate: { type: Boolean, value: false },
  },

  data: {
    mode: 'list', // list | create
    draft: '',
  },

  observers: {
    // 同时监听两个属性，避免父组件一次性 setData 时拿到旧的 startInCreate
    'visible, startInCreate': function (v, startInCreate) {
      // 每次打开都回到初始态，避免残留上次的输入
      if (v) {
        this.setData({
          mode: startInCreate ? 'create' : 'list',
          draft: '',
        });
      }
    },
  },

  methods: {
    noop() {},

    onClose() {
      this.triggerEvent('close');
    },

    onSelect(e) {
      const key = e.currentTarget.dataset.key;
      this.triggerEvent('select', { key });
    },

    onCreateStart() {
      this.setData({ mode: 'create', draft: '' });
    },

    onBack() {
      this.setData({ mode: 'list', draft: '' });
    },

    onDraftInput(e) {
      this.setData({ draft: e.detail.value });
    },

    onConfirmCreate() {
      const name = String(this.data.draft || '').trim();
      if (!name) {
        wx.showToast({ title: '给分类起个名字', icon: 'none' });
        return;
      }
      this.triggerEvent('create', { name });
    },
  },
});
