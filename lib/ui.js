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
function share() { return { title: '加油（加气）站测算工具｜经营利润与投资回报', path: '/pages/home/home', imageUrl: '/images/share-card-5x4.png' }; }
module.exports = { money, date, percent, payback, error, explain, menu, share };
