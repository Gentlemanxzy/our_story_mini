const thingsSvc = require('../../services/things');
const { LEVELS, MOOD_MAP } = require('../../constants');
const { calcProgress, recentTreasured, moodTop, formatDate } = require('../../utils/format');

Page({
  data: {
    progress: { total: 0, done: 0, pct: 0, levelText: '', gap: 0 },
    levels: [],
    counts: { treasured: 0, upcoming: 0, later: 0 },
    moods: [],
    timeline: [],
    loaded: false,
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const all = await thingsSvc.list();
    const progress = calcProgress(all);

    // 等级阶梯：按百分比点亮，因此清单增删后依然自洽
    const levels = LEVELS.map(lv =>
      Object.assign({}, lv, {
        reached: progress.pct >= lv.min,
        current: lv.lv === progress.level.lv,
      })
    );

    const counts = {
      treasured: all.filter(t => t.status === 'treasured').length,
      upcoming: all.filter(t => t.status === 'want' || t.status === 'waiting').length,
      later: all.filter(t => t.status === 'later').length,
    };

    const moods = moodTop(all, 3).map(m => {
      const meta = MOOD_MAP[m.key] || {};
      return { key: m.key, count: m.count, name: meta.name || m.key, glyph: meta.glyph || '' };
    });

    const timeline = recentTreasured(all, 10).map(t => {
      const meta = t.mood ? MOOD_MAP[t.mood] : null;
      const photos = Array.isArray(t.photos) ? t.photos.filter(Boolean) : [];
      return {
        _id: t._id,
        title: t.title,
        dateText: formatDate(t.doneDate),
        note: t.note || '',
        glyph: meta ? meta.glyph : '',
        photos,
        cover: photos[0] || '',
        photoCount: photos.length,
      };
    });

    this.setData({ progress, levels, counts, moods, timeline, loaded: true });
  },

  onPreview(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.timeline.find(t => t._id === id);
    if (!item || !item.photos.length) return;
    wx.previewImage({ urls: item.photos, current: item.photos[0] });
  },
});
