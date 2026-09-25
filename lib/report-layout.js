const brand = require('./brand');
const BLUE = '#004b8d', INK = '#17324a', MUTED = '#63798d', RED = '#c93643';
function wrap(text, measure, width) {
  const lines = []; let line = '';
  for (const char of String(text)) {
    if (char === '\n') { lines.push(line); line = ''; continue; }
    if (line && measure(line + char) > width) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}
function layout(report, measure) {
  const items = []; let y = 40, metricRowTop = 0;
  const rect = (x, top, width, height, color) => items.push({ kind: 'rect', x, y: top, width, height, color });
  function text(value, x, top, width, size = 25, color = INK, bold = false, fontFamily = 'sans-serif') {
    const lines = wrap(value, s => measure(s, size, bold, fontFamily), width);
    lines.forEach((t, i) => items.push({ kind: 'text', text: t, x, y: top + i * size * 1.5, size, color, bold, fontFamily }));
    return lines.length * size * 1.5;
  }
  function heading(title) {
    y += 28; rect(40, y + 4, 5, 31, BLUE);
    y += text(title, 59, y, 645, 29, BLUE, true) + 19;
  }
  items.push({ kind: 'image', src: brand.appLogo, x: 40, y, width: 76, height: 76 });
  text(brand.appName, 134, y + 3, 570, 26, BLUE, true);
  text('免费测算 · 本地计算，数据安全', 134, y + 45, 570, 22, MUTED);
  y = 151;
  y += text(report.title, 40, y, 670, 37, BLUE, true) + 14;
  y += text(report.name, 40, y, 670, 28, INK, true) + 4;
  y += text('测算时间：' + report.time, 40, y, 670, 21, MUTED) + 26;
  rect(40, y, 670, 2, '#d9e6f0'); y += 24;
  report.metrics.forEach((m, i) => {
    const top = y;
    if (report.type === 'break-even') {
      const labelH = text(m.label, 62, top + 18, 626, 26, BLUE, true);
      const valueH = text(m.value, 62, top + 32 + labelH, 626, 30, RED, true);
      rect(40, top + 15, 4, labelH + valueH + 22, RED);
      y = top + labelH + valueH + 56;
    } else if (i === 0) {
      const labelH = text(m.label, 62, top + 18, 626, 24, MUTED);
      const valueH = text(m.value, 62, top + 28 + labelH, 626, 46, RED, true);
      rect(40, top + 15, 4, labelH + valueH + 15, RED);
      y = top + labelH + valueH + 47;
    } else {
      const col = (i - 1) % 2, x = 40 + col * 345;
      if (col === 0) metricRowTop = y;
      const labelH = text(m.label, x, metricRowTop + 14, 315, 23, MUTED);
      const height = labelH + text(m.value, x, metricRowTop + 19 + labelH, 315, 32, RED, true) + 34;
      y = Math.max(y, metricRowTop + height);
    }
  });
  // Annual detail uses two columns to keep a 20-year report compact but complete.
  report.sections.forEach(s => {
    heading(s.title);
    if (s.compact) {
      for (let i = 0; i < s.rows.length; i += 2) {
        let height = 0;
        s.rows.slice(i, i + 2).forEach((r, col) => {
          const x = 40 + col * 345;
          const labelH = text(r.label, x, y + 9, 315, 22, MUTED);
          const valueH = text(r.value, x, y + 13 + labelH, 315, 25, r.highlight ? RED : INK, !!r.highlight);
          height = Math.max(height, labelH + valueH + 23);
        });
        y += height; rect(40, y, 670, 1, '#e8eef3');
      }
    } else s.rows.forEach(r => {
      const labelH = text(r.label, 40, y + 12, 270, 24, MUTED);
      let valueH;
      if (r.unitCost) {
        valueH = text(r.primaryValue, 330, y + 12, 380, 29, RED, true);
        if (r.secondaryValue) valueH += text(r.secondaryValue, 330, y + 16 + valueH, 380, 23, '#b85860') + 4;
      } else valueH = text(r.value, 330, y + 12, 380, 26, r.highlight ? RED : INK, !!r.highlight);
      y += Math.max(labelH, valueH) + 26; rect(40, y, 670, 1, '#e8eef3');
    });
  });
  if (report.annualTable) {
    const table = report.annualTable, widths = [60, 122, 122, 122, 122, 122];
    heading(table.title);
    y += text(table.unit, 40, y, 670, 22, MUTED) + 14;
    function tableRow(cells, header, index) {
      const size = header ? 21 : 22;
      const lines = cells.map((c, i) => wrap(c.value, s => measure(s, size, header || c.highlight), widths[i] - 12));
      const height = Math.max(...lines.map(a => a.length), 1) * size * 1.5 + 22;
      rect(40, y, 670, height, header ? '#edf5fb' : index % 2 ? '#f8fafc' : '#ffffff');
      let x = 40;
      cells.forEach((c, i) => {
        const top = y + (height - lines[i].length * size * 1.5) / 2;
        lines[i].forEach((line, j) => {
          const bold = header || c.highlight;
          const tx = x + (widths[i] - measure(line, size, bold)) / 2;
          text(line, tx, top + j * size * 1.5, widths[i] - 12, size, header ? BLUE : c.highlight ? RED : INK, bold);
        });
        rect(x, y, 1, height, '#d9e6f0'); x += widths[i];
      });
      rect(709, y, 1, height, '#d9e6f0');
      y += height; rect(40, y, 670, 1, '#d9e6f0');
    }
    tableRow(table.columns.map(c => ({ value: c.label })), true, 0);
    table.rows.forEach((r, i) => tableRow(r.cells, false, i));
    y += 16; y += text(table.note, 40, y, 670, 22, MUTED) + 8;
  }
  heading('测算口径');
  report.notes.forEach(n => { y += text('· ' + n, 40, y, 670, 23, MUTED) + 12; });
  heading('本报告术语说明');
  report.terms.forEach(t => { y += text(t.title, 40, y, 670, 25, BLUE, true) + 5;
    y += text(t.text, 40, y, 670, 23, MUTED) + 18; });
  y += 18; rect(40, y, 670, 2, '#d9e6f0'); y += 28;
  const footer = y;
  items.push({ kind: 'image', src: brand.accountLogo, x: 40, y, width: 82, height: 82 });
  const account = '公众号 · ' + brand.accountName;
  const nameWidth = measure(account, 24, true), sloganX = 140 + nameWidth + 26;
  const nameHeight = text(account, 140, y + 2, nameWidth + 1, 24, BLUE, true);
  rect(sloganX - 14, y + 5, 2, 27, '#b5cedf');
  const sloganFamily = '"Songti SC", serif';
  let sloganSize = 25;
  while (sloganSize > 18 && measure(brand.slogan, sloganSize, true, sloganFamily) > 710 - sloganX) sloganSize--;
  const sloganHeight = text(brand.slogan, sloganX, y, 710 - sloganX, sloganSize, '#28658b', true, sloganFamily);
  y += Math.max(nameHeight + 2, sloganHeight) + 13;
  y += text(brand.welcome, 140, y, 570, 23, MUTED);
  y = Math.max(y, footer + 82) + 27;
  y += text((report.type === 'break-even' ? '盈亏平衡销量计算器' : '加油（加气）站利润计算器') + ' · v2.0.0', 40, y, 670, 21, MUTED);
  return { width: 750, height: Math.ceil(y + 40), items };
}
function dimensions(plan, maxHeight = 16000) {
  const scale = Math.min(1, maxHeight / plan.height);
  return { width: Math.floor(plan.width * scale), height: Math.floor(plan.height * scale), scale };
}
function paint(ctx, plan, images, scale = 1) {
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, plan.width, plan.height); ctx.textBaseline = 'top';
  plan.items.forEach(item => {
    if (item.kind === 'image') ctx.drawImage(images[item.src], item.x, item.y, item.width, item.height);
    else if (item.kind === 'rect') { ctx.fillStyle = item.color; ctx.fillRect(item.x, item.y, item.width, item.height); }
    else { ctx.font = (item.bold ? 'bold ' : '') + item.size + 'px ' + (item.fontFamily || 'sans-serif'); ctx.fillStyle = item.color; ctx.fillText(item.text, item.x, item.y); }
  });
}
module.exports = { wrap, layout, dimensions, paint };
