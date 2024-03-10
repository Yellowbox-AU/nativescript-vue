import { isObject, isDef } from 'shared/util'
import { updateDevtools } from '../util'
import { VUE_ELEMENT_REF } from '../renderer/ElementNode'
import { ensureCorrectView } from './navigation-utils'
import { ContentView, Placeholder, View } from '@nativescript/core'

let sequentialCounter = 0

function serializeModalOptions(options) {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const allowed = ['fullscreen']

  return Object.keys(options)
    .filter(key => allowed.includes(key))
    .map(key => {
      return `${key}: ${options[key]}`
    })
    .concat(`uid: ${++sequentialCounter}`)
    .join(', ')
}

/** @returns {import('@nativescript/core').View} */
function getTargetView(target) {
  if (isObject(target) && isDef(target.$el)) {
    return target.$el.nativeView
  } else if (isDef(target.nativeView)) {
    return target.nativeView
  } else if (target[VUE_ELEMENT_REF]) {
    return target
  }
}

function _findParentModalEntry(vm) {
  if (!vm) {
    return false
  }

  let entry = vm.$parent
  while (entry && entry.$options.name !== 'ModalEntry') {
    entry = entry.$parent
  }

  return entry
}

export default {
  install(Vue) {
    Vue.mixin({
      created() {
        const self = this
        this.$modal = {
          close(data) {
            const entry = _findParentModalEntry(self)

            if (entry) {
              entry.closeCb(data)
            }
          }
        }
      }
    })

    Vue.prototype.$showModal = function (component, options) {
      return new Promise(async resolve => {
        let resolved = false
        const closeCb = data => {
          if (resolved) return

          resolved = true
          resolve(data)
          modalEntryInstance.nativeView.closeModal()

          // emitted to show up in devtools
          // for debugging purposes
          modalEntryInstance.$emit('modal:close', data)
          modalEntryInstance.$destroy()
        }

        // build options object with defaults
        options = Object.assign(
          {
            target: this.$root
          },
          options,
          {
            context: null,
            closeCallback: closeCb
          }
        )

        const modalEntryInstance = new Vue({
          name: 'ModalEntry',
          parent: options.target,
          methods: {
            closeCb
          },
          render: h => h(component, { key: serializeModalOptions(options),props: options.props })
        }).$mount()

        /** @type {View} */
        let view, contentView = new ContentView(), updatedCb
        contentView.iosOverflowSafeArea = false
        modalEntryInstance.$on('hook:updated', updatedCb = async () => {
          updateDevtools()
          if (modalEntryInstance.nativeView && !(modalEntryInstance.nativeView instanceof Placeholder) && modalEntryInstance.nativeView !== view) {
            // We will pass the ContentView to showModal so that we can actually change the content once it has been shown
            const newView = modalEntryInstance.nativeView
            const targetView = getTargetView(options.target)
            // Set/replace the content of the view shown in the modal
            contentView.content = newView
            // If first time the component rendered non-placeholder content then we show the modal
            // using the contentView
            if (!view)
              targetView.showModal(contentView, options)
            view = newView
          }
        })
        updatedCb()
      })
    }
  }
}
