function money(value) { return (Number(value) / 10000).toFixed(2) + ' 万元'; }
function date(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '日期未知';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function percent(v) { return v === null ? '不适用' : (v * 100).toFixed(2) + '%'; }
function payback(v) { return v === null ? '预测期内未回本' : v.toFixed(2) + ' 年'; }
function error(e) { wx.showModal({ title: '请核对', content: e.message || String(e), showCancel: false }); }
function explain(event) {
  const term = require('./terms').get(event.currentTarget.dataset.term);
  if (term) wx.showModal({ title: term.title, content: term.text, showCancel: false });
}
function menu() { wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); }
function shareImage() {
  const source = '/images/share-card-5x4.png';
  try {
    // 分享弹窗在部分开发者工具版本中无法直接读取代码包图片，使用本地副本。
    // 每次覆盖同一文件，保证换图后不会继续分享旧缓存，也不累积文件。
    const target = wx.env.USER_DATA_PATH + '/share-card-v3.png';
    wx.getFileSystemManager().copyFileSync(source, target);
    return target;
  } catch (e) {
    // 本地存储不可用时，仍保留微信支持的代码包图片作为回退。
    return source;
  }
}
function share() { return { title: '加油（加气）站利润·投资专用计算器', path: '/pages/home/home', imageUrl: shareImage() }; }
module.exports = { money, date, percent, payback, error, explain, menu, share };
