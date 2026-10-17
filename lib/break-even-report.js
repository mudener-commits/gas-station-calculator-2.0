const investment = require('./investment');
const { money, date } = require('./ui');
const glossary = require('./terms');
const row = (label, value, highlight = false) => ({ label, value, highlight });
function build(result) {
  // Read the calculation snapshot, never the currently edited form.
  const base = investment.calculate({ ...result.form, annualEbitda: 0 });
  const f = base.form;
  const volume = target => target.status === 'solved'
    ? target.volumes.map(p => p.name + '：约 ' + p.dailyText + ' ' + p.unit + '/日').join('\n')
    : '未找到可达平衡销量';
  const financial = [
    row('经营/预测期', f.years + ' 年'), row('年折现率\n（期望年回报率）', f.discountRate + '%'), row('企业所得税测算率', f.incomeTaxRate + '%'),
    row(f.selfOwned ? '经营方式' : '合作方式', base.modeName),
    ...(f.selfOwned ? [row('年度租金', money(0))] : []),
    ...(!f.selfOwned && investment.isRental(f.mode) ? [row('首年租金成本', money(Number(f.rent))), row('租金年递增', f.rentGrowth + '%'),
      row('租金支付安排', f.mode === 0 ? '每月末支付' : f.mode === 1 ? '每 ' + f.frequency + ' 个月预付；首期 ' + f.prepaidPeriods + ' 期' : '每 ' + f.paymentYears + ' 年期初预付，末期按剩余年数支付')] : []),
    ...(f.mode === 2 ? [row('业主动态租金比例', f.shareRate + '%（支付前税前利润正数为基数）')] : []),
    ...(f.mode === 3 ? [row('年度固定管理费', money(Number(f.managementFee)))] : []),
    row('固定资产投入合计', money(f.assets.reduce((sum,a) => sum + Number(a.amount), 0))),
    ...f.assets.map(a => row(a.name, money(Number(a.amount)) + ' · 折旧 ' + a.life + ' 年')),
    row('其他前期投入', money(Number(f.otherInitial))), row('流动资金\n（期初投入、期末回收）', money(base.workingCapital)),
    row('首期预付租金', money(base.initialRent)), row('初始投入合计', money(base.initial)), row('我方初始出资', money(base.ownInitial)),
    row('贷款金额', money(Number(f.loanAmount))),
    ...(Number(f.loanAmount) > 0 ? [row('贷款年利率 / 期限', f.loanRate + '% / ' + f.loanYears + ' 年'),
      row('还款方式', f.repayment === 1 ? '每月付息，到期还本' : '等额本息'), row('预测期末另行结清本金', money(base.terminalDebt))] : [])
  ];
  const growth = f.growth.slice(0, Number(f.years));
  const products = result.products.flatMap(p => [row(p.name + '销量配比', p.ratio + '%'), row(p.name + '含税毛利', p.margin + ' 元/' + p.unit), row(p.name + '单位经营费用', p.cost + ' 元/' + p.unit)]);
  return { type: 'break-even', title: '盈亏平衡销量测算报告', name: f.name || '未命名方案', time: date(result.time),
    metrics: [
      { label: '财务盈亏平衡销量（含折旧）', value: volume(result.accounting), term: 'break-even-accounting' },
      { label: '投资回报平衡销量（考虑资金时间价值）', value: volume(result.investment), term: 'break-even-investment' }
    ],
    sections: [{ title: '测算条件与投入', rows: financial }, { title: '油气配比、毛利与单位费用', rows: products },
      { title: '逐年经营收益修正', rows: growth.map((g,i) => row('第 ' + (i+1) + ' 年较上年', g + '%')) }],
    briefProducts: result.products.map(p => row(p.name, p.ratio + '%\n毛利 ' + p.margin + ' 元/' + p.unit + '\n费用 ' + p.cost + ' 元/' + p.unit)),
    growthSummary: growth.every(g => Number(g) === 0) ? '全部为 0%，各年不变' : growth.map((g,i) => '第' + (i+1) + '年 ' + g + '%').join('；'),
    notes: [
      ...base.warnings.filter(n => n.startsWith('自有站经营：')),
      '财务平衡结果：' + result.accounting.note, '投资回报平衡结果：' + result.investment.note,
      '销量为每年 365 天的基准日均值。油品用升、LNG 用公斤，按日销量数值配比，不是吨数占比，不直接合计不同单位。毛利、配比与单位费用保持不变，各年经营收益按年度修正累计调整。',
      '毛利为含税售价减含税进价，按油品 13%、LNG 9% 换算不含税价差。单位经营费用随销量同比变化，含人工、水电、损耗和经营税费等分摊，不含采购、租金、折旧、利息与所得税；这些项目不重复扣除。',
      '资产按直线法、零残值折旧；其他前期投入不自动折旧或抵税。流动资金期初投入、期末全额收回，不计利润；NPV 按实际收付时点计入预付租金、贷款本息和期末剩余本金结清。',
      '两种销量对应各自平衡目标，不是同一销量同时满足两个目标。结果未预留安全余量，不代表每月资金充足；测算假设与实际经营存在差异，详见小程序口径说明。'
    ], terms: ['break-even-accounting', 'break-even-investment'].map(glossary.get)
  };
}
function brief(report) {
  const assetNames = ['站房及改造', '设备设施', '其他固定资产'];
  return { ...report, variant: 'brief', title: report.title.replace('报告', '摘要'),
    sections: [{ title: '测算条件概览', rows: report.sections[0].rows.filter(r => !assetNames.includes(r.label)) },
      { title: '油气配比、毛利与费用', rows: report.briefProducts },
      { title: '年度修正', rows: [row('各年修正', report.growthSummary)] }]
  };
}
module.exports = { build, brief };
