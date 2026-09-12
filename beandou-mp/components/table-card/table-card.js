// components/table-card/table-card.js
// 桌台状态卡（柔和卡片风）：白色卡底 + 状态色浅晕染 + 实色药丸徽章 + 深色大数字
// 空闲=白卡引导开台 / 使用中=绿 / 临期=黄+倒计时 / 暂停=蓝 / 超时=红+红色光晕
const helpers = require('../../utils/helpers')

const DEFAULT_COLORS = { idle: '#6b7280', running: '#22c55e', paused: '#3b82f6', warn: '#f59e0b', overtime: '#ef4444' }
const STATUS_TEXT = { idle: '空闲', running: '使用中', warn: '即将超时', paused: '已暂停', overtime: '已超时' }
const STATUS_ICON = { warn: '⏳ ', overtime: '⚠ ' }

Component({
  properties: {
    table: { type: Object, value: {} },
    runtime: { type: Object, value: {} },
    label: { type: String, value: '' },
    overtimeWarn: { type: Number, value: 5 },
    colors: { type: Object, value: {} },
  },
  data: {
    visual: 'idle',
    statusText: '空闲',
    statusIcon: '',
    textClass: '',
    timeDisplay: '',
    subDisplay: '',
    feeDisplay: '',
    footLeft: '',
    cardStyle: '',
    pillStyle: '',
    timeStyle: '',
    barTrack: '',
    barFill: '',
    showBar: false,
    itemCount: 0,
  },
  observers: {
    'table, runtime, colors, overtimeWarn': function (table, rt, colors, warnMin) {
      if (!table || !rt) return
      const c = Object.assign({}, DEFAULT_COLORS, colors || {})

      // visual: 展示用的视觉状态(warn 是 running 的临期子状态)
      let visual = rt.status === 'overtime' ? 'overtime' : table.status
      let timeDisplay = ''
      let subDisplay = ''
      let footLeft = ''
      let feeDisplay = ''
      let showBar = false
      let barPct = 0

      if (table.status === 'idle') {
        visual = 'idle'
        footLeft = '点击开台'
        feeDisplay = ''
      } else {
        const elapsedText = helpers.msToHMS(rt.elapsedMs)
        const fee = helpers.fmt(rt.timeFee + rt.itemsTotal)
        if (rt.status === 'overtime') {
          // 大字直接显示超出多久
          timeDisplay = `+${helpers.msToHMS(-rt.remainingMs)}`
          subDisplay = `已用时 ${elapsedText}`
          showBar = table.expectedMinutes > 0
          barPct = 100
        } else if (table.status === 'paused') {
          visual = 'paused'
          timeDisplay = elapsedText
          subDisplay = table.expectedMinutes > 0 ? `剩余 ${helpers.msToHMS(rt.remainingMs)}` : '暂停计时中'
          showBar = table.expectedMinutes > 0
          barPct = table.expectedMinutes > 0 ? (rt.elapsedMs / (table.expectedMinutes * 60000)) * 100 : 0
        } else if (table.expectedMinutes > 0) {
          const nearEnd = warnMin > 0 && rt.remainingMs <= warnMin * 60000
          visual = nearEnd ? 'warn' : 'running'
          // 固定时长：大字显示剩余倒计时
          timeDisplay = helpers.msToHMS(rt.remainingMs)
          subDisplay = `已用时 ${elapsedText}`
          showBar = true
          barPct = (rt.elapsedMs / (table.expectedMinutes * 60000)) * 100
        } else {
          visual = 'running'
          timeDisplay = elapsedText
          subDisplay = '开放计时 · 不限时长'
        }
        footLeft = `${table.customer || '未留名'}${table.people > 0 ? ' · ' + table.people + '人' : ''}`
        feeDisplay = ''
      }

      // 状态色 -> 占用中整卡实色(白字)，空闲白卡；两种状态一眼可辨
      let cardStyle = ''
      let textClass = ''
      let pillStyle = ''
      let timeStyle = ''
      let barTrack = ''
      let barFill = ''
      if (visual !== 'idle') {
        const base = c[visual]
        const isLight = helpers.luminance(base) > 0.62
        // 对角渐变实色卡 + 同色光晕(超时卡的光晕交给动画类)
        cardStyle = `background:linear-gradient(135deg, ${helpers.shade(base, 0.12)}, ${helpers.shade(base, -0.14)});`
        if (visual !== 'overtime') {
          cardStyle += `box-shadow:0 8rpx 24rpx ${helpers.rgba(base, 0.35)};`
        }
        if (isLight) {
          // 用户配了浅色：整卡换深色文字保证可读
          textClass = 'dark-text'
          pillStyle = 'background:rgba(30,41,59,0.14);color:#1e293b;'
          timeStyle = 'color:#1e293b;'
          barTrack = 'background:rgba(30,41,59,0.16);'
          barFill = `width:${Math.max(2, Math.min(100, barPct))}%;background:#1e293b;`
        } else {
          textClass = 'light-text'
          pillStyle = 'background:rgba(255,255,255,0.25);color:#ffffff;'
          timeStyle = 'color:#ffffff;'
          barTrack = 'background:rgba(255,255,255,0.32);'
          barFill = `width:${Math.max(2, Math.min(100, barPct))}%;background:#ffffff;`
        }
      }

      this.setData({
        visual,
        statusText: STATUS_TEXT[visual] || '空闲',
        statusIcon: STATUS_ICON[visual] || '',
        textClass,
        timeDisplay,
        subDisplay,
        footLeft,
        feeDisplay,
        showBar,
        cardStyle,
        pillStyle,
        timeStyle,
        barTrack,
        barFill,
        itemCount: table.items ? table.items.length : 0,
      })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.table.id })
    },
  },
})
