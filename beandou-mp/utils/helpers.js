// utils/helpers.js - 辅助函数

function pad2(n) {
  return String(n).padStart(2, '0')
}

function todayStr(d) {
  d = d || new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function nowStr() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function msToHMS(ms) {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}时${pad2(m)}分${pad2(s)}秒`
  return `${pad2(m)}分${pad2(s)}秒`
}

function daysBetween(d1, d2) {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((b - a) / 86400000)
}

function fmt(n) {
  return '¥' + (Math.round(n * 100) / 100).toFixed(2)
}

function shiftDate(dateStr, delta) {
  const d = parseDate(dateStr)
  if (!d) return todayStr()
  d.setDate(d.getDate() + delta)
  return todayStr(d)
}

// ---- 颜色工具：状态色 -> 浅色底/深色文字，保证自定义颜色也可读 ----

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (!Number.isFinite(n)) return { r: 136, g: 136, b: 136 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r, g, b) {
  const p = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}

// percent > 0 变亮, < 0 变暗，返回 hex
function shade(hex, percent) {
  const { r, g, b } = hexToRgb(hex)
  const f = 1 + percent
  return rgbToHex(r * f, g * f, b * f)
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// 供文字/描边使用的"深一档"颜色：颜色太浅时自动压暗，避免白底看不清
function accentColor(hex) {
  return luminance(hex) > 0.62 ? shade(hex, -0.38) : hex
}

// 自定义导航栏顶部留白：导航卡放在胶囊按钮下方 12px；
// 胶囊数据异常(如部分环境返回0)时按 状态栏高度+44px 兜底，保证不与内容重叠
function navPaddingTop() {
  let menu = null
  try { menu = wx.getMenuButtonBoundingClientRect() } catch (e) { /* ignore */ }
  let statusBar = 24
  try { statusBar = wx.getWindowInfo().statusBarHeight || 24 } catch (e) { /* ignore */ }
  return menu && menu.bottom > 0 ? menu.bottom + 12 : statusBar + 44
}

module.exports = {
  pad2,
  todayStr,
  nowStr,
  parseDate,
  msToHMS,
  daysBetween,
  fmt,
  shiftDate,
  hexToRgb,
  shade,
  rgba,
  luminance,
  accentColor,
  navPaddingTop,
}
