const marketing = require('../../lib/marketing');
const drawing = require('../../lib/marketing-report');
const storage = require('../../lib/storage');
const ui = require('../../lib/ui');

const draftKey = 'gasStationMarketingDraftV1';
const fmt = drawing.fmt;
const productView = form => form.products.filter(p => p.key !== 'lng' || form.hasLng).map((p, index) => ({ ...p, index,
  volumeLabel: '原日均销量（' + p.unit + '/天）', marginLabel: '含税毛利（元/' + p.unit + '）',
  changeLabel: (form.mode === 'raise' ? '涨价幅度' : '降价 / 优惠') + '（元/' + p.unit + '）',
  costLabel: '其他随销量费用（元/' + p.unit + '）', promotionLabel: '活动另增费用（元/' + p.unit + '）' }));
function volumeText(oil, lng, hasOil = oil > 0, hasLng = lng > 0) {
  const parts = [];
  if (hasOil) parts.push('油品 ' + fmt(oil) + ' 升/天');
  if (hasLng) parts.push('LNG ' + fmt(lng) + ' 公斤/天');
  return parts.join(' · ');
}
Page({
  data: {
    form: marketing.initialForm(), productRows: productView(marketing.initialForm()),
    result: null, preview: null, sliderMax: 200, sliderValue: 110,
    reportImage: '', exporting: false, hasRecent: false, showAdvanced: false
  },
  onLoad() {
    ui.menu();
    const saved = storage.read(draftKey, null);
    const form = saved && Array.isArray(saved.products) && saved.products.length === 4 ? saved : marketing.initialForm();
    this.setData({ form, productRows: productView(form), hasRecent: storage.list(storage.KEYS.recent).length > 0 });
  },
  onReady() { this.chartReady = true; if (this._result) this.drawChart(); },
  onHide() { this.persist(); },
  onUnload() { this.persist(); },
  persist() { try { storage.write(draftKey, this.data.form); } catch (err) { ui.error(err); } },
  invalidate(values) {
    this._result = null;
    this.setData({ ...values, result: null, preview: null, reportImage: '' });
  },
  input(event) {
    const key = event.currentTarget.dataset.key;
    this.invalidate({ ['form.' + key]: event.detail.value });
  },
  productInput(event) {
    const { index, key } = event.currentTarget.dataset;
    const path = 'form.products[' + index + '].' + key;
    const rows = this.data.productRows.map(row => row.index === Number(index) ? { ...row, [key]: event.detail.value } : row);
    this.invalidate({ [path]: event.detail.value, productRows: rows });
  },
  nameInput(event) { this.setData({ 'form.name': event.detail.value, reportImage: '' }); },
  modeChange(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.form.mode) return;
    const form = { ...this.data.form, mode };
    this.invalidate({ form, productRows: productView(form) });
  },
  lngChange(event) {
    const form = { ...this.data.form, hasLng: !!event.detail.value };
    this.invalidate({ form, productRows: productView(form) });
  },
  toggleAdvanced() { this.setData({ showAdvanced: !this.data.showAdvanced }); },
  sample() {
    const form = marketing.initialForm();
    form.products[0].volume = 5000; form.products[0].change = 0.1;
    form.products[1].volume = 2000; form.products[1].change = 0.1;
    form.products[2].volume = 3000;
    this.invalidate({ form, productRows: productView(form) });
    wx.showToast({ title: '已填入示例', icon: 'none' });
  },
  importRecent() {
    const recent = storage.list(storage.KEYS.recent)[0];
    if (!recent) return wx.showToast({ title: '暂无经营测算数据', icon: 'none' });
    try {
      const imported = marketing.fromOperatingRecord(recent);
      const current = this.data.form;
      imported.mode = current.mode; imported.days = current.days;
      imported.activityCost = current.activityCost;
      imported.products.forEach((p, i) => {
        p.change = current.products[i].change;
        p.participation = current.products[i].participation;
        p.incrementalCost = current.products[i].incrementalCost;
        p.promotionCost = current.products[i].promotionCost;
      });
      this.invalidate({ form: imported, productRows: productView(imported) });
      wx.showToast({ title: '已带入最近经营数据', icon: 'none' });
    } catch (err) { ui.error(err); }
  },
  calculate() {
    try {
      const result = marketing.calculate(this.data.form);
      this._result = result;
      const factor = result.factor;
      const mainUnit = result.oilBase ? '升/天' : '公斤/天';
      const mainValue = result.status === 'unreachable' ? '无法保利' : fmt(result.oilBase ? result.requiredOil : result.requiredLng);
      const secondary = result.oilBase && result.lngBase && factor !== null ? 'LNG ' + fmt(result.requiredLng) + ' 公斤/天' : '';
      const difference = result.status === 'unreachable' ? '新增销量的经营贡献不足，请减少优惠或活动费用。'
        : factor > 1 ? '比原来需多卖约 ' + fmt((factor - 1) * 100, 1) + '%'
          : '比原来最多可少卖约 ' + fmt((1 - factor) * 100, 1) + '%';
      const baseline = volumeText(result.oilBase, result.lngBase);
      const previewPercent = Math.max(0, Math.min(Number(this.data.sliderValue) || 110, 10000));
      const sliderMax = Math.min(10000, Math.max(200, Math.ceil((factor || 1) * 125), Math.ceil(previewPercent * 1.1)));
      this.setData({ result: { status: result.status, factor, mainUnit, mainValue, secondary, difference, baseline,
        days: result.days, mixed: !!result.lngBase }, sliderMax, sliderValue: previewPercent, reportImage: '' }, () => {
        this.updatePreview(previewPercent); wx.pageScrollTo({ selector: '#marketing-result', duration: 250 });
      });
      this.persist();
    } catch (err) { ui.error(err); }
  },
  sliderChange(event) { this.updatePreview(Number(event.detail.value)); },
  updatePreview(percent) {
    if (!this._result) return;
    const factor = percent / 100, result = this._result, delta = result.evaluate(factor);
    this.setData({ sliderValue: percent, reportImage: '',
      preview: { volume: volumeText(Math.round(result.oilBase * factor), Math.round(result.lngBase * factor), !!result.oilBase, !!result.lngBase),
        daily: (delta >= 0 ? '每天多赚 ' : '每天少赚 ') + fmt(Math.abs(delta)) + ' 元',
        total: '整个活动期约' + (delta >= 0 ? '多赚 ' : '少赚 ') + fmt(Math.abs(delta) * result.days) + ' 元',
        positive: delta >= 0 } }, () => this.drawChart());
  },
  drawChart() {
    if (!this.chartReady || !this._result) return;
    wx.createSelectorQuery().in(this).select('#marketingChart').fields({ node: true, size: true }).exec(res => {
      const entry = res && res[0]; if (!entry || !entry.node || !entry.width) return;
      const canvas = entry.node, dpr = wx.getSystemInfoSync().pixelRatio || 1;
      canvas.width = Math.round(entry.width * dpr); canvas.height = Math.round(entry.height * dpr);
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.fillStyle = '#fcfeff'; ctx.fillRect(0, 0, entry.width, entry.height);
      drawing.chart(ctx, this._result, this.data.sliderValue / 100, 24, 17, entry.width - 48, entry.height - 64, true);
    });
  },
  async generateImage() {
    if (!this._result || this.data.exporting) return;
    this.setData({ exporting: true }); wx.showLoading({ title: '生成分享图片' });
    try {
      const canvas = await new Promise((resolve, reject) => {
        wx.createSelectorQuery().in(this).select('#marketingReportCanvas').fields({ node: true, size: true }).exec(res => {
          if (res && res[0] && res[0].node) resolve(res[0].node); else reject(new Error('当前微信版本暂不支持图片生成'));
        });
      });
      canvas.width = 750; canvas.height = 1800;
      drawing.paint(canvas.getContext('2d'), this._result, this.data.form, this.data.sliderValue / 100);
      const path = await new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, fileType: 'png',
        width: 750, height: 1800, destWidth: 750, destHeight: 1800,
        success: r => resolve(r.tempFilePath), fail: reject }, this));
      this.setData({ reportImage: path }, () => wx.pageScrollTo({ selector: '#marketing-share', duration: 250 }));
      canvas.width = 1; canvas.height = 1;
    } catch (err) { ui.error(new Error(err.message || '分享图片生成失败，请重试')); }
    finally { wx.hideLoading(); this.setData({ exporting: false }); }
  },
  previewImage() { if (this.data.reportImage) wx.previewImage({ current: this.data.reportImage, urls: [this.data.reportImage] }); },
  shareImage() {
    if (!this.data.reportImage) return;
    if (wx.showShareImageMenu) wx.showShareImageMenu({ path: this.data.reportImage,
      fail: err => { if (!/cancel/i.test(err.errMsg || '')) ui.error(new Error('图片分享暂不可用，可保存后转发')); } });
    else this.previewImage();
  },
  saveImage() {
    if (!this.data.reportImage) return;
    wx.saveImageToPhotosAlbum({ filePath: this.data.reportImage,
      success: () => wx.showToast({ title: '图片已保存' }),
      fail: err => {
        if (/auth|deny/i.test(err.errMsg || '')) wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片后重试。', confirmText: '打开设置', success: r => { if (r.confirm) wx.openSetting({}); } });
        else if (!/cancel/i.test(err.errMsg || '')) ui.error(new Error('图片保存失败，请重试'));
      } });
  },
  onShareAppMessage() { return { ...ui.share(), title: '营销活动保利计算器', path: '/pages/marketing/marketing' }; },
  onShareTimeline() { return { title: '营销活动保利计算器' }; }
});
