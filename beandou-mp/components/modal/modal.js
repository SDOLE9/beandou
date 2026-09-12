// components/modal/modal.js
Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onMaskTap() {
      this.triggerEvent('close')
    },
    onSheetTap() {
      // 阻止冒泡
    },
  },
})
