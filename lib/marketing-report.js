const BLUE = '#0068ad', DARK = '#004b8d', RED = '#d84b50', GREEN = '#0b8469', INK = '#17324b', MUTED = '#5f788b';
const fmt = (value, digits = 0) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function wrap(ctx, value, x, y, maxWidth, lineHeight) {
  let line = '', nextY = y;
  for (const char of String(value)) {
    if (line && ctx.measureText(line + char).width > maxWidth) { ctx.fillText(line, x, nextY); nextY += lineHeight; line = ''; }
    line += char;
  }
  if (line) ctx.fillText(line, x, nextY);
  return nextY + lineHeight;
}
function amounts(result, factor, ceil = false) {
  const round = ceil ? Math.ceil : Math.round, parts = [];
  if (result.oilBase) parts.push('油品 ' + fmt(round(result.oilBase * factor - (ceil ? 1e-9 : 0))) + ' 升/天');
  if (result.lngBase) parts.push('LNG ' + fmt(round(result.lngBase * factor - (ceil ? 1e-9 : 0))) + ' 公斤/天');
  return parts.join(' · ');
}
function chart(ctx, result, previewFactor, x, y, width, height, labels = true) {
  const low = Math.max(0, Math.min(0.7, previewFactor * 0.8, result.factor === null ? 0.7 : result.factor * 0.8));
  const high = Math.max(1.3, previewFactor * 1.15, result.factor === null ? 1.3 : result.factor * 1.15, low + 0.3);
  const samples = Array.from({ length: 33 }, (_, i) => ({ factor: low + (high - low) * i / 32 }));
  samples.forEach(p => { p.value = result.evaluate(p.factor); });
  const maxAbs = Math.max(1, ...samples.map(p => Math.abs(p.value)), Math.abs(result.evaluate(previewFactor))) * 1.13;
  const mapX = factor => x + (factor - low) / (high - low) * width;
  const mapY = value => y + (maxAbs - value) / (2 * maxAbs) * height;
  const zeroY = mapY(0);
  ctx.fillStyle = '#edf9f4'; ctx.fillRect(x, y, width, zeroY - y);
  ctx.fillStyle = '#fff0ed'; ctx.fillRect(x, zeroY, width, y + height - zeroY);
  ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x + width, zeroY); ctx.stroke();
  ctx.strokeStyle = BLUE; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
  samples.forEach((p, i) => { if (i) ctx.lineTo(mapX(p.factor), mapY(p.value)); else ctx.moveTo(mapX(p.factor), mapY(p.value)); }); ctx.stroke();
  ctx.strokeStyle = '#a9c2d3'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath();
  ctx.moveTo(mapX(1), y); ctx.lineTo(mapX(1), y + height); ctx.stroke();
  if (result.factor !== null) {
    ctx.strokeStyle = GREEN; ctx.beginPath(); ctx.moveTo(mapX(result.factor), y);
    ctx.lineTo(mapX(result.factor), y + height); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = GREEN; ctx.beginPath(); ctx.arc(mapX(result.factor), zeroY, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.setLineDash([]); ctx.fillStyle = '#f5a237'; ctx.beginPath();
  ctx.arc(mapX(previewFactor), mapY(result.evaluate(previewFactor)), 6, 0, Math.PI * 2); ctx.fill();
  if (labels) {
    ctx.font = '13px sans-serif'; ctx.fillStyle = RED; ctx.fillText('原利润', x + 5, zeroY - 6);
    ctx.fillStyle = MUTED; ctx.fillText('原销量', Math.max(x, mapX(1) - 20), y + height + 19);
    if (result.factor !== null) {
      const threshold = result.oilBase && result.lngBase ? fmt(result.factor * 100, 1) + '%'
        : result.oilBase ? fmt(result.requiredOil) + ' 升' : fmt(result.requiredLng) + ' 公斤';
      ctx.fillStyle = GREEN;
      ctx.fillText('保利点 ' + threshold, Math.max(x, Math.min(x + width - 135, mapX(result.factor) - 35)), y + height + 37);
    }
  }
}
function paint(ctx, result, form, previewFactor) {
  const width = 750, height = 1800;
  ctx.fillStyle = '#f4f8fb'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = DARK; ctx.fillRect(0, 0, width, 155);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 38px sans-serif'; ctx.fillText('营销活动保利测算', 42, 67);
  ctx.font = '21px sans-serif';
  wrap(ctx, [String(form.name || '').trim(), form.mode === 'raise' ? '涨价 / 提高利润率' : '降价 / 做活动', form.days + ' 天'].filter(Boolean).join(' · '), 42, 113, 660, 28);
  roundRect(ctx, 32, 178, 686, 221, 22, '#fff', '#d7e6ef');
  ctx.fillStyle = MUTED; ctx.font = '23px sans-serif'; ctx.fillText('保持活动前经营利润，日均销量至少达到', 56, 220);
  ctx.fillStyle = DARK; ctx.font = 'bold 35px sans-serif';
  wrap(ctx, result.status === 'unreachable' ? '当前活动无法靠增加销量保利' : amounts(result, result.factor, true), 56, 278, 637, 43);
  ctx.fillStyle = result.factor !== null && result.factor <= 1 ? GREEN : RED; ctx.font = 'bold 24px sans-serif';
  const difference = result.factor === null ? '新增销量的经营贡献不足以弥补活动损失'
    : result.factor > 1 ? '比原来需多卖约 ' + fmt((result.factor - 1) * 100, 1) + '%'
      : '比原来最多可少卖约 ' + fmt((1 - result.factor) * 100, 1) + '%';
  ctx.fillText(difference, 56, 369);
  roundRect(ctx, 32, 425, 686, 477, 22, '#fff', '#d7e6ef');
  ctx.fillStyle = INK; ctx.font = 'bold 29px sans-serif'; ctx.fillText('保利交叉图', 56, 470);
  ctx.fillStyle = RED; ctx.fillRect(56, 493, 28, 4); ctx.fillStyle = MUTED; ctx.font = '20px sans-serif'; ctx.fillText('原利润线', 91, 500);
  ctx.fillStyle = BLUE; ctx.fillRect(230, 493, 28, 4); ctx.fillStyle = MUTED; ctx.fillText('活动后利润', 266, 500);
  chart(ctx, result, previewFactor, 69, 540, 612, 260, true);
  ctx.fillStyle = MUTED; ctx.font = '19px sans-serif';
  ctx.fillText(result.oilBase && result.lngBase ? '横轴：原销量的百分比；油品升数和 LNG 公斤数分别换算'
    : result.oilBase ? '横轴：全站油品日均销量（升/天）' : '横轴：LNG 日均销量（公斤/天）', 56, 874);
  roundRect(ctx, 32, 929, 686, 161, 22, '#fff', '#d7e6ef');
  ctx.fillStyle = INK; ctx.font = 'bold 26px sans-serif'; ctx.fillText('预计活动日销量', 56, 975);
  ctx.fillStyle = DARK; ctx.font = 'bold 25px sans-serif'; wrap(ctx, amounts(result, previewFactor), 56, 1015, 637, 31);
  const diff = result.evaluate(previewFactor);
  ctx.fillStyle = diff >= 0 ? GREEN : RED; ctx.font = 'bold 23px sans-serif';
  ctx.fillText('预计每天' + (diff >= 0 ? '多赚' : '少赚') + ' ' + fmt(Math.abs(diff)) + ' 元 · 活动期约 ' + fmt(Math.abs(diff) * result.days) + ' 元', 56, 1069);
  roundRect(ctx, 32, 1116, 686, 444, 22, '#fff', '#d7e6ef');
  ctx.fillStyle = INK; ctx.font = 'bold 27px sans-serif'; ctx.fillText('本次测算条件', 56, 1160);
  ctx.fillStyle = MUTED; ctx.font = '20px sans-serif'; ctx.fillText('一次性活动费 / 物料费：' + fmt(Number(form.activityCost)) + ' 元', 56, 1196);
  let lineY = 1235;
  form.products.filter(p => p.key !== 'lng' || form.hasLng).forEach(p => {
    ctx.fillStyle = INK; ctx.font = 'bold 21px sans-serif'; ctx.fillText(p.name + '：' + fmt(Number(p.volume)) + ' ' + p.unit + '/天', 56, lineY);
    ctx.fillStyle = MUTED; ctx.font = '18px sans-serif';
    ctx.fillText('毛利 ' + fmt(Number(p.margin), 2) + ' 元/' + p.unit + ' · ' + (form.mode === 'raise' ? '涨价' : '优惠') + ' ' + fmt(Number(p.change), 2) + ' 元/' + p.unit + ' · 原销量参与 ' + fmt(Number(p.participation)) + '%', 56, lineY + 26);
    if (Number(p.incrementalCost) || Number(p.promotionCost)) {
      ctx.fillStyle = MUTED; ctx.font = '18px sans-serif';
      ctx.fillText('其他随销量费用 ' + fmt(Number(p.incrementalCost), 2) + ' · 活动另增费用 ' + fmt(Number(p.promotionCost), 2) + ' 元/' + p.unit, 56, lineY + 50);
    }
    lineY += 75;
  });
  ctx.fillStyle = MUTED; ctx.font = '18px sans-serif';
  wrap(ctx, '口径：原销量按参与比例参加活动；新增销量按各品种原销量同比增加，参加对应活动。采购单价不变。油品按升、LNG 按公斤分别计算，不直接相加。', 42, 1605, 666, 27);
  ctx.font = '17px sans-serif'; ctx.fillText('加油（加气）站利润·投资专用计算器 · 本地测算', 42, 1755);
  return { width, height };
}
module.exports = { chart, paint, amounts, fmt };
