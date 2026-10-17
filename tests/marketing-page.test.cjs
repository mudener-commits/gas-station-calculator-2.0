const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function pageEnvironment() {
  const saved = new Map(), actions = [];
  const context = { measureText: text => ({ width: String(text).length * 12 }),
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {},
    fillRect() {}, fillText() {}, arc() {}, setLineDash() {}, scale() {},
    set font(_) {}, set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set lineJoin(_) {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  const wx = {
    getStorageSync: key => saved.get(key) || '', setStorageSync: (key, value) => saved.set(key, structuredClone(value)),
    showShareMenu() {}, showToast() {}, pageScrollTo() {}, showModal: value => actions.push(['modal', value]),
    showLoading() {}, hideLoading() {}, getSystemInfoSync: () => ({ pixelRatio: 2 }),
    createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, fields() { return this; }, exec(fn) { fn([{ node: canvas, width: 360, height: 210 }]); } }),
    canvasToTempFilePath: options => options.success({ tempFilePath: '/tmp/marketing-share.png' }),
    showShareImageMenu: options => actions.push(['share', options.path]),
    saveImageToPhotosAlbum: options => { actions.push(['save', options.filePath]); options.success(); },
    previewImage: options => actions.push(['preview', options.current])
  };
  global.wx = wx;
  const file = path.join(__dirname, '../pages/marketing/marketing.js'); let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), wx, Page: definition => { page = definition; }, console });
  page.data = structuredClone(page.data);
  page.setData = function (patch, callback) {
    Object.entries(patch).forEach(([key, value]) => {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = structuredClone(value);
    });
    if (callback) callback();
  };
  return { page, saved, actions };
}

test('marketing page saves its own draft, recalculates after edits and exports a shareable PNG', async () => {
  const { page, saved, actions } = pageEnvironment();
  page.onLoad(); page.sample(); page.calculate();
  assert.equal(page.data.result.status, 'solved');
  assert.ok(page.data.result.factor > 1);
  assert.ok(page.data.preview.volume.includes('升/天'));
  page.sliderChange({ detail: { value: 130 } });
  assert.equal(page.data.sliderValue, 130);
  page.onHide(); assert.ok(saved.has('gasStationMarketingDraftV1'));
  await page.generateImage();
  assert.equal(page.data.reportImage, '/tmp/marketing-share.png');
  page.shareImage(); page.saveImage(); page.previewImage();
  assert.deepEqual(actions.slice(-3).map(item => item[0]), ['share', 'save', 'preview']);
  page.sliderChange({ detail: { value: 120 } });
  assert.equal(page.data.reportImage, '');
  await page.generateImage();
  page.nameInput({ detail: { value: '改名后的活动' } });
  assert.equal(page.data.reportImage, '');
  page.productInput({ currentTarget: { dataset: { index: 0, key: 'change' } }, detail: { value: '0.2' } });
  assert.equal(page.data.result, null);
  assert.equal(page.data.reportImage, '');
  delete global.wx;
});
