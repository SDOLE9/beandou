// pages/dashboard/dashboard.js
const app = getApp()
const store = app.globalData.store
const helpers = require('../../utils/helpers')
const alert = require('../../utils/alert')

Page({
  data: {
    navHeight: 0,
    shopName: '',
    clock: '',
    overtimeWarn: 5,
    colors: {},
    statColors: {},
    areaOptions: ['全部区域'],
    areaIdx: 0,
    statusOptions: ['全部', '空闲', '使用中', '已暂停', '已超时'],
    statusIdx: 0,
    summary: { running: 0, idleTables: 0, overtime: 0, totalPeople: 0 },
    areaList: [],
    // Modal
    modalType: '',
    modalTitle: '',
    currentTableId: '',
    // Start form
    form: { customer: '', phone: '', people: '1', modeIdx: 0, duration: '60', notes: '' },
    modeOptions: ['开放计时', '固定时长'],
    // Running dialog data
    runData: {},
    // Checkout
    checkout: { notes: '' },
    // Extend
    extendMinutes: '30',
    // Confirm
    confirmData: { title: '', msg: '' },
    confirmCallback: null,
    // Toast
    toast: { visible: false, msg: '', type: '' },
  },

  onLoad() {
    this.setData({ navHeight: helpers.navPaddingTop() })
    this.refreshAll()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.refreshAll()
  },

  onTick() {
    this.setData({ clock: helpers.nowStr() })
    this.refreshDashboard()
    this.refreshSummary()
    this.checkOvertimeAlerts()
    // 运行中弹窗打开时，实时刷新计时显示
    if (this.data.modalType === 'running') {
      const t = store.getTable(this.data.currentTableId)
      if (t && t.status !== 'idle') this.showRunningDialog(t)
    }
  },

  // 超时语音提醒：边沿触发，每桌从正常转为超时的那一刻响一次
  checkOvertimeAlerts() {
    if (!this._overtimeAlerted) this._overtimeAlerted = {}
    store.state.tables.forEach(t => {
      if (t.status === 'idle') {
        delete this._overtimeAlerted[t.id]
        return
      }
      const rt = store.tableRuntime(t)
      if (rt.status === 'overtime') {
        if (!this._overtimeAlerted[t.id]) {
          this._overtimeAlerted[t.id] = true
          alert.playOvertimeAlert()
        }
      } else {
        // 加时后回到正常计时的桌子，下次再超时可以重新提醒
        delete this._overtimeAlerted[t.id]
      }
    })
  },

  refreshAll() {
    const s = store.state.settings
    const c = s.colors
    this.setData({
      shopName: s.shopName,
      clock: helpers.nowStr(),
      overtimeWarn: s.overtimeWarn,
      colors: { ...c },
      // 数字用"深一档"状态色，避免自定义浅色在白底上看不清
      statColors: {
        running: helpers.accentColor(c.running),
        idle: helpers.accentColor(c.idle),
        overtime: helpers.accentColor(c.overtime),
      },
      areaOptions: ['全部区域', ...s.areas.map(a => a.name)],
    })
    this.refreshDashboard()
    this.refreshSummary()
  },

  refreshSummary() {
    const sum = store.todaySummary()
    this.setData({
      summary: {
        running: sum.running,
        overtime: sum.overtime || 0,
        idleTables: sum.idleTables,
        totalPeople: sum.totalPeople,
      },
    })
  },

  refreshDashboard() {
    const s = store.state.settings
    const areaF = this.data.areaIdx === 0 ? 'all' : s.areas[this.data.areaIdx - 1].id
    const statusF = ['all', 'idle', 'running', 'paused', 'overtime'][this.data.statusIdx]
    let areas = s.areas
    if (areaF !== 'all') areas = areas.filter(a => a.id === areaF)

    const areaList = areas.map(area => {
      const tables = area.tables.map(n => {
        const t = store.getTable(store.tableId(area.id, n))
        if (!t) return null
        const rt = store.tableRuntime(t)
        return { ...t, runtime: rt, label: store.tableLabel(area.id, n) }
      }).filter(Boolean)

      const filtered = tables.filter(t => {
        if (statusF === 'all') return true
        return t.runtime.status === statusF
      })

      const counts = { idle: 0, running: 0, paused: 0, overtime: 0 }
      tables.forEach(t => { counts[t.runtime.status] = (counts[t.runtime.status] || 0) + 1 })
      const totalPeople = tables.reduce((s, t) => s + (t.status !== 'idle' ? (t.people || 0) : 0), 0)

      return {
        id: area.id,
        name: area.name,
        tables: filtered,
        total: tables.length,
        counts,
        totalPeople,
      }
    })

    this.setData({ areaList })
  },

  // 筛选
  onAreaChange(e) {
    this.setData({ areaIdx: e.detail.value })
    this.refreshDashboard()
  },
  onStatusChange(e) {
    this.setData({ statusIdx: e.detail.value })
    this.refreshDashboard()
  },

  // 桌台点击
  onTableTap(e) {
    const id = e.currentTarget.dataset.id || e.detail.id
    const t = store.getTable(id)
    if (!t) return
    if (t.status === 'idle') {
      this.showStartDialog(t)
    } else {
      this.showRunningDialog(t)
    }
  },

  // 开台弹窗
  showStartDialog(t) {
    const s = store.state.settings
    this.setData({
      modalType: 'start',
      modalTitle: store.tableLabel(t.areaId, t.number),
      currentTableId: t.id,
      form: {
        customer: '',
        phone: '',
        people: '1',
        modeIdx: s.defaultDuration === 0 ? 0 : 1,
        duration: String(s.defaultDuration || 60),
        notes: '',
      },
    })
  },

  onModeChange(e) {
    this.setData({ 'form.modeIdx': parseInt(e.detail.value, 10) })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  confirmStart() {
    const f = this.data.form
    const t = store.getTable(this.data.currentTableId)
    if (!t) return
    let dur = 0
    if (f.modeIdx === 1) {
      dur = parseInt(f.duration, 10) || 0
      if (dur < 5) return this.toast('固定时长不能少于5分钟', 'error')
    }
    store.startTable(t.id, {
      customer: f.customer.trim(),
      phone: f.phone.trim(),
      people: parseInt(f.people, 10) || 1,
      expectedMinutes: dur,
      notes: f.notes.trim(),
    })
    this.closeModal()
    this.refreshDashboard()
    this.refreshSummary()
    this.toast(`${store.tableLabel(t.areaId, t.number)} 已开台`, 'success')
  },

  // 运行中弹窗
  showRunningDialog(t) {
    const rt = store.tableRuntime(t)
    const isPaused = t.status === 'paused'
    const isOvertime = rt.status === 'overtime'
    this.setData({
      modalType: 'running',
      modalTitle: `${store.tableLabel(t.areaId, t.number)} · ${t.customer || '顾客'}`,
      currentTableId: t.id,
      runData: {
        customer: t.customer,
        phone: t.phone,
        people: t.people,
        statusText: isPaused ? '已暂停' : isOvertime ? '已超时' : '使用中',
        timeDisplay: helpers.msToHMS(rt.elapsedMs),
        remainDisplay: t.expectedMinutes > 0 ? helpers.msToHMS(Math.abs(rt.remainingMs)) : '',
        remainLabel: rt.overtime ? '已超时' : '剩余',
        isPaused,
      },
    })
  },

  // 操作
  onPause() {
    store.pauseTable(this.data.currentTableId)
    this.closeModal()
    this.refreshDashboard()
    this.refreshSummary()
    this.toast('已暂停', 'success')
  },

  onResume() {
    store.resumeTable(this.data.currentTableId)
    this.closeModal()
    this.refreshDashboard()
    this.refreshSummary()
    this.toast('已继续计时', 'success')
  },

  onClear() {
    this.setData({
      modalType: 'confirm',
      confirmData: {
        title: '确认清空该桌台？',
        msg: `将放弃当前记录，桌台恢复空闲。此操作不可撤销。`,
      },
      confirmCallback: () => {
        store.clearTable(this.data.currentTableId)
        this.closeModal()
        this.refreshDashboard()
        this.refreshSummary()
        this.toast('已清空', 'success')
      },
    })
  },

  // 加时
  onExtend() {
    this.setData({ modalType: 'extend', extendMinutes: '30' })
  },
  confirmExtend() {
    const min = parseInt(this.data.extendMinutes, 10) || 0
    if (min < 5) return this.toast('加时不能少于5分钟', 'error')
    store.extendTable(this.data.currentTableId, min)
    const t = store.getTable(this.data.currentTableId)
    this.setData({ modalType: '' })
    this.showRunningDialog(t)
    this.toast(`已加时 ${min} 分钟`, 'success')
  },

  // 结束
  onCheckout() {
    const t = store.getTable(this.data.currentTableId)
    this.setData({
      modalType: 'checkout',
      checkout: { notes: t.notes || '' },
    })
  },

  onCheckoutInput(e) {
    this.setData({ 'checkout.notes': e.detail.value })
  },

  confirmCheckout() {
    const t = store.getTable(this.data.currentTableId)
    store.checkout(t.id, {
      notes: this.data.checkout.notes.trim(),
    })
    this.closeModal()
    this.refreshDashboard()
    this.refreshSummary()
    this.toast('已结束', 'success')
  },

  showRunning() {
    const t = store.getTable(this.data.currentTableId)
    this.showRunningDialog(t)
  },

  // 确认弹窗
  confirmOk() {
    const cb = this.data.confirmCallback
    this.setData({ modalType: '', confirmCallback: null })
    if (cb) cb()
  },

  closeModal() {
    this.setData({ modalType: '' })
  },

  // Toast
  toastTimer: null,
  toast(msg, type = '') {
    clearTimeout(this.toastTimer)
    this.setData({ toast: { visible: true, msg, type } })
    this.toastTimer = setTimeout(() => {
      this.setData({ 'toast.visible': false })
    }, 2400)
  },
})
