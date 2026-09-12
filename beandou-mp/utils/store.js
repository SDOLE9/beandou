// utils/store.js - 拼豆计时管理系统 数据管理
// 全局状态管理，使用 wx.setStorageSync 持久化

const DEFAULTS = {
  shopName: '拼豆工坊',
  pricePerHour: 30,
  defaultDuration: 0,
  overtimeWarn: 5,
  voiceAlert: true,
  colors: { idle: '#6b7280', running: '#22c55e', paused: '#3b82f6', warn: '#f59e0b', overtime: '#ef4444' },
  areas: [
    { id: 'A', name: 'A区', tables: [1, 2, 3, 4, 5, 6] },
    { id: 'B', name: 'B区', tables: [1, 2, 3, 4] },
  ],
  paymentMethods: ['现金', '微信', '支付宝', '银行卡', '会员卡', '其他'],
}

const STORE_KEY = 'pindou_system_v1'

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

const store = {
  state: null,

  init() {
    this.loadState()
  },

  loadState() {
    try {
      const raw = wx.getStorageSync(STORE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        s.settings = Object.assign({}, DEFAULTS, s.settings || {})
        s.settings.colors = Object.assign({}, DEFAULTS.colors, (s.settings || {}).colors || {})
        s.tables = s.tables || []
        s.sales = s.sales || []
        s.storage = s.storage || []
        this.state = s
      } else {
        this.state = {
          settings: deepClone(DEFAULTS),
          tables: [],
          sales: [],
          storage: [],
          seq: { sales: 0, storage: 0 },
        }
      }
    } catch (e) {
      console.error('加载状态失败', e)
      this.state = {
        settings: deepClone(DEFAULTS),
        tables: [],
        sales: [],
        storage: [],
        seq: { sales: 0, storage: 0 },
      }
    }
    this.syncTables()
  },

  saveState() {
    try {
      wx.setStorageSync(STORE_KEY, JSON.stringify(this.state))
    } catch (e) {
      console.error('保存失败', e)
    }
  },

  // 桌台唯一ID
  tableId(areaId, num) {
    return `${areaId}-${num}`
  },

  tableLabel(areaId, num) {
    const area = this.state.settings.areas.find(a => a.id === areaId)
    return `${area ? area.name : areaId} ${num}号桌`
  },

  // 同步桌台运行时对象
  syncTables() {
    const ids = new Set()
    this.state.settings.areas.forEach(area => {
      area.tables.forEach(num => {
        const id = this.tableId(area.id, num)
        ids.add(id)
        if (!this.state.tables.find(t => t.id === id)) {
          this.state.tables.push({
            id, areaId: area.id, number: num,
            status: 'idle',
            customer: '', phone: '', notes: '',
            sessionStart: 0,
            accumulatedMs: 0,
            pausedAt: 0,
            expectedMinutes: 0,
            pricePerHour: this.state.settings.pricePerHour,
            people: 0,
            items: [],
          })
        }
      })
    })
    // 删除已不存在的桌台(仅空闲中)
    this.state.tables = this.state.tables.filter(t => ids.has(t.id) || t.status !== 'idle')
  },

  getTable(id) {
    return this.state.tables.find(t => t.id === id)
  },

  // 计算桌台实时数据
  tableRuntime(t) {
    const now = Date.now()
    let elapsedMs = t.accumulatedMs
    let status = t.status
    if (status === 'running') elapsedMs += now - t.sessionStart
    let remainingMs = null
    let overtime = false
    if (t.expectedMinutes > 0) {
      remainingMs = t.expectedMinutes * 60000 - elapsedMs
      if (remainingMs <= 0 && status !== 'idle') {
        status = 'overtime'
        overtime = true
      }
    }
    const hours = elapsedMs / 3600000
    const timeFee = Math.round(hours * t.pricePerHour * 100) / 100
    const itemsTotal = t.items.reduce((s, it) => s + it.price * it.qty, 0)
    return { elapsedMs, remainingMs, overtime, status, timeFee, itemsTotal, hours }
  },

  // 开台
  startTable(id, opts) {
    const t = this.getTable(id)
    if (!t) return
    t.status = 'running'
    t.customer = opts.customer || ''
    t.phone = opts.phone || ''
    t.notes = opts.notes || ''
    t.pricePerHour = opts.pricePerHour || this.state.settings.pricePerHour
    t.expectedMinutes = opts.expectedMinutes || 0
    t.sessionStart = Date.now()
    t.accumulatedMs = 0
    t.pausedAt = 0
    t.items = []
    t.people = opts.people || 1
    this.saveState()
  },

  // 暂停
  pauseTable(id) {
    const t = this.getTable(id)
    if (!t || t.status !== 'running') return
    t.accumulatedMs += Date.now() - t.sessionStart
    t.sessionStart = 0
    t.status = 'paused'
    t.pausedAt = Date.now()
    this.saveState()
  },

  // 继续
  resumeTable(id) {
    const t = this.getTable(id)
    if (!t || t.status !== 'paused') return
    t.status = 'running'
    t.sessionStart = Date.now()
    t.pausedAt = 0
    this.saveState()
  },

  // 清空
  clearTable(id) {
    const t = this.getTable(id)
    if (!t) return
    this._resetTable(t)
    this.saveState()
  },

  _resetTable(t) {
    t.status = 'idle'
    t.customer = ''
    t.phone = ''
    t.notes = ''
    t.sessionStart = 0
    t.accumulatedMs = 0
    t.pausedAt = 0
    t.expectedMinutes = 0
    t.items = []
    t.people = 0
  },

  // 加时
  extendTable(id, minutes) {
    const t = this.getTable(id)
    if (!t) return
    t.expectedMinutes += minutes
    this.saveState()
  },

  // 加购
  addItems(id, items) {
    const t = this.getTable(id)
    if (!t) return
    t.items.push(...items)
    this.saveState()
  },

  // 结账
  checkout(id, opts) {
    const t = this.getTable(id)
    if (!t) return null
    const rt = this.tableRuntime(t)
    const timeFee = opts.timeFee !== undefined ? opts.timeFee : rt.timeFee
    const itemsTotal = rt.itemsTotal
    const total = timeFee + itemsTotal
    this.state.seq.sales = (this.state.seq.sales || 0) + 1
    const record = {
      id: 'S' + Date.now(),
      seq: this.state.seq.sales,
      date: this._todayStr(),
      time: this._nowStr(),
      timestamp: Date.now(),
      tableId: t.id,
      tableLabel: this.tableLabel(t.areaId, t.number),
      areaId: t.areaId,
      customer: t.customer || '',
      phone: t.phone || '',
      people: t.people || 0,
      durationMs: rt.elapsedMs,
      durationText: this._msToHMS(rt.elapsedMs),
      timeFee,
      items: deepClone(t.items),
      itemsTotal,
      total,
      paymentMethod: opts.paymentMethod || '现金',
      notes: opts.notes || '',
    }
    this.state.sales.push(record)
    this._resetTable(t)
    this.saveState()
    return { record, total }
  },

  // 储存记录
  addStorage(rec) {
    rec.id = 'R' + Date.now()
    rec.status = 'stored'
    rec.storeTs = Date.now()
    this.state.storage.push(rec)
    this.saveState()
  },

  updateStorage(id, fields) {
    const r = this.state.storage.find(r => r.id === id)
    if (!r) return
    Object.assign(r, fields)
    this.saveState()
  },

  deleteStorage(id) {
    this.state.storage = this.state.storage.filter(r => r.id !== id)
    this.saveState()
  },

  pickStorage(id) {
    const r = this.state.storage.find(r => r.id === id)
    if (!r) return
    r.status = 'picked'
    r.pickTs = Date.now()
    this.saveState()
  },

  // 设置更新
  updateSetting(key, value) {
    this.state.settings[key] = value
    this.saveState()
  },

  updateColors(colors) {
    this.state.settings.colors = Object.assign({}, this.state.settings.colors, colors)
    this.saveState()
  },

  // 区域管理
  addArea() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const used = this.state.settings.areas.map(a => a.id)
    const nextId = letters.split('').find(c => !used.includes(c)) || 'X' + this.state.settings.areas.length
    this.state.settings.areas.push({ id: nextId, name: nextId + '区', tables: [1, 2, 3] })
    this.syncTables()
    this.saveState()
  },

  updateArea(idx, field, value) {
    const a = this.state.settings.areas[idx]
    if (!a) return
    if (field === 'name') {
      a.name = value || a.id + '区'
    } else if (field === 'tables') {
      a.tables = value.split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
      a.tables = [...new Set(a.tables)].sort((x, y) => x - y)
    } else if (field === 'price') {
      a.pricePerHour = parseFloat(value) || undefined
    }
    this.syncTables()
    this.saveState()
  },

  deleteArea(idx) {
    this.state.settings.areas.splice(idx, 1)
    this.syncTables()
    this.saveState()
  },

  // 统计：今日概要
  todaySummary() {
    const today = this._todayStr()
    const daySales = this.state.sales.filter(s => s.date === today)
    const total = daySales.reduce((s, r) => s + r.total, 0)
    const running = this.state.tables.filter(t => t.status !== 'idle').length
    const overtime = this.state.tables.filter(t => {
      if (t.status === 'idle') return false
      return this.tableRuntime(t).status === 'overtime'
    }).length
    const totalPeople = this.state.tables.reduce((s, t) => s + (t.status !== 'idle' ? (t.people || 0) : 0), 0)
    const allTables = this.state.tables.length
    const idleTables = this.state.tables.filter(t => t.status === 'idle').length
    return { total, running, overtime, totalPeople, allTables, idleTables }
  },

  // 导出数据
  exportData() {
    return JSON.stringify(this.state, null, 2)
  },

  importData(jsonStr) {
    const data = JSON.parse(jsonStr)
    this.state = Object.assign(this._newState(), data)
    this.state.settings = Object.assign({}, DEFAULTS, this.state.settings || {})
    this.state.settings.colors = Object.assign({}, DEFAULTS.colors, (this.state.settings || {}).colors || {})
    this.syncTables()
    this.saveState()
  },

  clearToday() {
    const today = this._todayStr()
    this.state.sales = this.state.sales.filter(s => s.date !== today)
    this.saveState()
  },

  clearAll() {
    this.state.sales = []
    this.state.storage = []
    this.state.seq = { sales: 0, storage: 0 }
    this.state.tables.forEach(t => this._resetTable(t))
    this.saveState()
  },

  _newState() {
    return {
      settings: deepClone(DEFAULTS),
      tables: [],
      sales: [],
      storage: [],
      seq: { sales: 0, storage: 0 },
    }
  },

  _todayStr(d) {
    d = d || new Date()
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  },

  _nowStr() {
    const d = new Date()
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  },

  _msToHMS(ms) {
    if (ms < 0) ms = 0
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const p = n => String(n).padStart(2, '0')
    if (h > 0) return `${h}时${p(m)}分${p(s)}秒`
    return `${p(m)}分${p(s)}秒`
  },
}

module.exports = store
