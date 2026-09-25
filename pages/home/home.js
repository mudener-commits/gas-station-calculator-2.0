const ui = require('../../lib/ui');
Page({ data: { version: '2.0.0' }, onLoad: ui.menu,
  open(e) { wx.navigateTo({ url: '/pages/' + e.currentTarget.dataset.page }); },
  onShareAppMessage: ui.share, onShareTimeline() { return { title: '加油站经营利润与投资回报测算' }; }
});
