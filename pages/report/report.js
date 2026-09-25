const storage = require('../../lib/storage');
const ui = require('../../lib/ui');
const { layout, dimensions, paint } = require('../../lib/report-layout');
const brand = require('../../lib/brand');
const reports = require('../../lib/report');
const imageKind = event => event && event.currentTarget && event.currentTarget.dataset.kind === 'brief' ? 'brief' : 'full';
Page({
  data: { report: null, brand, images: [], briefImage: '', exporting: false, exportingKind: '' },
  onLoad() { const saved = storage.read(storage.KEYS.report, null); this.setData({ report: saved ? reports.conciseExplanations(saved) : null }); ui.menu(); },
  explain: ui.explain,
  async generate(event) {
    if (!this.data.report || this.data.exporting) return;
    const kind = imageKind(event), isBrief = kind === 'brief';
    this.setData({ exporting: true, exportingKind: kind }); wx.showLoading({ title: isBrief ? '正在排版简要版' : '正在排版完整版' });
    try {
      const canvas = await new Promise((resolve, reject) => {
        wx.createSelectorQuery().in(this).select('#reportCanvas').fields({ node: true, size: true }).exec(res => {
          if (res[0] && res[0].node) resolve(res[0].node); else reject(new Error('当前环境暂不支持图片导出，请更新微信后重试'));
        });
      });
      canvas.width = 750; canvas.height = 100;
      const ctx = canvas.getContext('2d');
      const setFont = (size, bold, family = 'sans-serif') => { ctx.font = (bold ? 'bold ' : '') + size + 'px ' + family; };
      const report = isBrief ? reports.brief(this.data.report) : this.data.report;
      const plan = layout(report, (text, size, bold, family) => { setFont(size, bold, family); return ctx.measureText(text).width; });
      const logos = {};
      await Promise.all([brand.appLogo, brand.accountLogo].map(src => new Promise((resolve, reject) => {
        const image = canvas.createImage();
        image.onload = () => { logos[src] = image; resolve(); };
        image.onerror = () => reject(new Error('品牌图片加载失败，请重试')); image.src = src;
      })));
      const exportAt = async limit => {
        const size = dimensions(plan, limit);
        canvas.width = size.width; canvas.height = size.height;
        paint(canvas.getContext('2d'), plan, logos, size.scale);
        return new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, fileType: 'png', width: size.width, height: size.height, destWidth: size.width, destHeight: size.height, success: r => resolve(r.tempFilePath), fail: reject }, this));
      };
      wx.showLoading({ title: isBrief ? '生成简要图片' : '生成完整长图' });
      let path;
      try { path = await exportAt(16000); }
      catch (_) { path = await exportAt(8192); }
      this.setData(isBrief ? { briefImage: path } : { images: [path] }, () => wx.pageScrollTo({ selector: isBrief ? '#brief-preview' : '#full-preview', duration: 250 }));
      // Release the large drawing buffer; the exported file remains available.
      canvas.width = 1; canvas.height = 1;
    } catch (err) { ui.error(new Error(err.message || '图片生成失败，请重试')); } finally { this.setData({ exporting: false, exportingKind: '' }); wx.hideLoading(); }
  },
  imagePath(event) { return imageKind(event) === 'brief' ? this.data.briefImage : this.data.images[0]; },
  preview(event) { const path = this.imagePath(event); if (path) wx.previewImage({ current: path, urls: [path] }); },
  shareImage(event) {
    const path = this.imagePath(event); if (!path) return;
    if (wx.showShareImageMenu) wx.showShareImageMenu({ path, fail: e => { if (!/cancel/i.test(e.errMsg || '')) ui.error(new Error('图片分享暂不可用，可保存后转发')); } });
    else this.preview(event);
  },
  save(event) {
    const filePath = this.imagePath(event); if (!filePath) return;
    wx.saveImageToPhotosAlbum({ filePath, success: () => wx.showToast({ title: imageKind(event) === 'brief' ? '已保存简要图片' : '已保存完整长图' }), fail: e => {
      if (/auth|deny/i.test(e.errMsg || '')) wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片后重试。', confirmText: '打开设置', success: r => { if (r.confirm) wx.openSetting({}); } });
      else if (!/cancel/i.test(e.errMsg || '')) ui.error(new Error('图片未保存，请重试'));
    } });
  },
  onShareAppMessage: ui.share,
  onShareTimeline() { return { title: '油站经营与投资测算工具' }; }
});
