const { STATUSES, MOODS } = require('../../constants');
const { toISODate, buildCategoryMap } = require('../../utils/format');
const categoriesSvc = require('../../services/categories');
const media = require('../../services/media');

const REASON_TEXT = {
  EMPTY: '给分类起个名字',
  DUP: '已经有这个分类了',
  LIMIT: '分类太多了，先删几个吧',
  NOT_FOUND: '分类不存在',
};

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    thing: { type: Object, value: null },
    categories: { type: Array, value: [] },
  },

  data: {
    statuses: STATUSES,
    moods: MOODS,
    today: '',
    catList: [],
    catName: '',
    catPickerVisible: false,
    photos: [],
    removedPhotos: [],
    localPhotos: 0,
    maxPhotos: media.MAX_PHOTOS,
    saving: false,
    form: {
      status: 'want',
      doneDate: '',
      mood: '',
      note: '',
      category: '',
    },
  },

  observers: {
    'visible, thing': function (visible, thing) {
      if (!visible || !thing) return;
      const photos = Array.isArray(thing.photos) ? thing.photos.slice() : [];
      this.setData({
        today: toISODate(),
        catList: this.data.categories,
        catName: this.pickName(thing.category),
        photos,
        removedPhotos: [],
        localPhotos: media.countLocal(photos),
        saving: false,
        form: {
          status: thing.status || 'want',
          doneDate: thing.doneDate || '',
          mood: thing.mood || '',
          note: thing.note || '',
          category: thing.category || '',
        },
      });
    },

    'form.category, categories': function (category, list) {
      if (list && list.length) {
        this.setData({ catName: this.pickName(category, list) });
      }
    },
  },

  methods: {
    noop() {},

    pickName(key, list) {
      const src = list || this.data.categories || [];
      const hit = src.find(c => c.key === key);
      if (hit) return hit.name;
      return buildCategoryMap(src)[key] || '未分类';
    },

    onClose() {
      this.triggerEvent('close');
    },

    onStatusTap(e) {
      const status = e.currentTarget.dataset.key;
      const patch = { status };
      // 标为「已经珍藏」时默认补当天日期，少一次操作
      if (status === 'treasured' && !this.data.form.doneDate) {
        patch.doneDate = toISODate();
      }
      if (status !== 'treasured') {
        patch.doneDate = '';
      }
      this.setData({
        'form.status': patch.status,
        'form.doneDate': patch.doneDate !== undefined ? patch.doneDate : this.data.form.doneDate,
      });
    },

    onDateChange(e) {
      this.setData({ 'form.doneDate': e.detail.value });
    },

    onMoodTap(e) {
      const key = e.currentTarget.dataset.key;
      // 再点一次取消选择
      this.setData({ 'form.mood': this.data.form.mood === key ? '' : key });
    },

    onNoteInput(e) {
      this.setData({ 'form.note': e.detail.value });
    },

    /* ── 分类 ── */

    onOpenCat() {
      this.setData({ catList: this.data.categories, catPickerVisible: true });
    },

    onCatPickerClose() {
      this.setData({ catPickerVisible: false });
    },

    onCatSelect(e) {
      this.setData({
        'form.category': e.detail.key,
        catPickerVisible: false,
      });
    },

    async onCatCreate(e) {
      const res = await categoriesSvc.create(e.detail.name);
      if (!res.ok) {
        wx.showToast({ title: REASON_TEXT[res.reason] || '建不了', icon: 'none' });
        return;
      }
      const list = await categoriesSvc.list();
      this.setData({
        catList: list,
        'form.category': res.item.key,
        catName: res.item.name,
        catPickerVisible: false,
      });
      wx.showToast({ title: '分类建好了', icon: 'none' });
    },

    /* ── 照片 ── */

    async onChoosePhoto() {
      const remain = this.data.maxPhotos - this.data.photos.length;
      if (remain <= 0) {
        wx.showToast({ title: `最多 ${this.data.maxPhotos} 张`, icon: 'none' });
        return;
      }

      try {
        const res = await wx.chooseMedia({
          count: remain,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        });
        const add = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!add.length) return;
        const photos = this.data.photos.concat(add);
        this.setData({ photos, localPhotos: media.countLocal(photos) });
      } catch (e) {
        const msg = String((e && e.errMsg) || '');
        // 用户取消不算错误（errMsg 含 cancel）；隐私未声明才会被系统拦下
        if (/privacy|not authorized|deny/i.test(msg)) {
          wx.showModal({
            title: '还不能选图',
            content:
              '小程序后台的《用户隐私保护指引》里需要声明「选中的照片或视频信息」，否则系统会直接拒绝打开相册。',
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#C2603F',
          });
        }
      }
    },

    onPreviewPhoto(e) {
      const index = Number(e.currentTarget.dataset.index) || 0;
      const urls = this.data.photos.filter(Boolean);
      if (!urls.length) return;
      wx.previewImage({ urls, current: urls[index] || urls[0] });
    },

    onRemovePhoto(e) {
      const index = Number(e.currentTarget.dataset.index);
      const photos = this.data.photos.slice();
      const dropped = photos.splice(index, 1)[0];
      const removed = dropped && !media.isTemp(dropped)
        ? this.data.removedPhotos.concat([dropped])
        : this.data.removedPhotos;
      this.setData({ photos, removedPhotos: removed, localPhotos: media.countLocal(photos) });
    },

    async onSave() {
      const { form } = this.data;
      if (form.status === 'treasured' && !form.doneDate) {
        wx.showToast({ title: '选个完成的日期吧', icon: 'none' });
        return;
      }
      if (this.data.saving) return;

      const photos = this.data.photos.filter(Boolean);
      const needUpload = photos.filter(p => !media.isCloud(p));

      if (needUpload.length) {
        this.setData({ saving: true });
        wx.showLoading({ title: '保存照片…', mask: true });
        const persisted = await media.persistMany(photos, (i, n) =>
          wx.showLoading({ title: `保存照片 ${i}/${n}`, mask: true })
        );
        wx.hideLoading();
        this.setData({ saving: false });
        media.remove(this.data.removedPhotos);
        this.triggerEvent('save', Object.assign({}, form, { photos: persisted }));
        return;
      }

      media.remove(this.data.removedPhotos);
      this.triggerEvent('save', Object.assign({}, form, { photos }));
    },
  },
});
