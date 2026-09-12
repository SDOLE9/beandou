// app.js - 拼豆计时管理系统 小程序入口
const store = require('./utils/store')

App({
  onLaunch() {
    store.init()
    // 每秒刷新计时
    this.timer = setInterval(() => {
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      if (cur && typeof cur.onTick === 'function') {
        cur.onTick()
      }
    }, 1000)
  },
  onUnload() {
    clearInterval(this.timer)
  },
  globalData: {
    store
  }
})
