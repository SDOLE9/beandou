// pages/sales/sales.js
const app = getApp()
const store = app.globalData.store
const helpers = require('../../utils/helpers')

Page({
  data: {
    navHeight: 0,
    dateStr: '',
    weekday: '',
    todayStr: '',
    daySales: [],
    summary: {},
  },

  onLoad() {
    this.setData({
      navHeight: helpers.navPaddingTop(),
      dateStr: helpers.todayStr(),
      todayStr: helpers.todayStr(),
    })
    this.refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.refresh()
  },

  refresh() {
    const dateStr = this.data.dateStr
    const d = helpers.parseDate(dateStr)
    const weekday = d ? '周' + '日一二三四五六'[d.getDay()] : ''
    const daySales = store.state.sales
      .filter(s => s.date === dateStr)
      .sort((a, b) => a.timestamp - b.timestamp)

    const tables = new Set(daySales.map(r => r.tableId)).size
    const totalPeople = daySales.reduce((s, r) => s + (r.people || 0), 0)

    this.setData({
      daySales,
      weekday,
      summary: {
        tables,
        count: daySales.length,
        totalPeople,
      },
    })
  },

  onDateChange(e) {
    this.setData({ dateStr: e.detail.value })
    this.refresh()
  },

  prevDay() {
    this.setData({ dateStr: helpers.shiftDate(this.data.dateStr, -1) })
    this.refresh()
  },

  nextDay() {
    this.setData({ dateStr: helpers.shiftDate(this.data.dateStr, 1) })
    this.refresh()
  },

  goToday() {
    this.setData({ dateStr: helpers.todayStr() })
    this.refresh()
  },
})
