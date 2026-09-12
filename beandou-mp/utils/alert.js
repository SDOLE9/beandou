// utils/alert.js - 超时语音提醒
// 播放内置提示音(alert.wav)并配合震动；受设置页"超时语音提醒"开关控制
const store = require('./store')

let ctx = null

function ensureCtx() {
  if (!ctx) {
    ctx = wx.createInnerAudioContext()
    ctx.src = '/assets/alert.wav'
    ctx.volume = 1
    // obeyMuteSwitch 默认 true：跟随手机静音拨片，静音时不打扰
  }
  return ctx
}

// 桌台进入超时状态时调用(边沿触发，每桌每次超时只响一次)
function playOvertimeAlert() {
  try {
    if (!store.state.settings.voiceAlert) return
    const c = ensureCtx()
    c.stop()
    c.play()
    wx.vibrateLong({ type: 'medium', fail: () => {} })
  } catch (e) {
    console.error('播放超时提醒失败', e)
  }
}

module.exports = { playOvertimeAlert }
