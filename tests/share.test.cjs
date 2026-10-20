const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../lib/ui.js'), 'utf8');
function load(wx) {
  const context = { module: { exports: {} }, wx };
  vm.runInNewContext(source, context);
  return context.module.exports;
}
test('转发先完成图片复制，再返回本地文件；重复分享覆盖同一文件', () => {
  const copies = [];
  const ui = load({ env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager() {
    return { copyFileSync(from, to) { copies.push([from, to]); } };
  } });
  for (let i = 0; i < 2; i++) {
    const share = ui.share();
    assert.equal(copies.length, i + 1);
    assert.equal(share.imageUrl, 'wxfile://usr/share-card-v3.png');
    assert.equal(share.path, '/pages/home/home');
    assert.equal(share.title, '加油（加气）站利润·投资专用计算器');
  }
  assert.deepEqual(copies, Array.from({ length: 2 }, () => ['/images/share-card-5x4.png', 'wxfile://usr/share-card-v3.png']));
});
test('本地写入失败仍返回代码包封面，不中断分享', () => {
  const ui = load({ env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager() {
    return { copyFileSync() { throw Error('storage full'); } };
  } });
  assert.equal(ui.share().imageUrl, '/images/share-card-5x4.png');
});
test('文件接口缺失时仍可分享', () => {
  assert.equal(load({}).share().imageUrl, '/images/share-card-5x4.png');
});
test('转发封面存在并明确纳入打包', () => {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  assert.ok(config.packOptions.include.some(x => x.type === 'file' && x.value === 'images/share-card-5x4.png'));
  const image = fs.readFileSync(path.join(root, 'images/share-card-5x4.png'));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), 500);
  assert.equal(image.readUInt32BE(20), 400);
});
