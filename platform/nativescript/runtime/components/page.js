// @ts-check
import { updateDevtools } from '../../util'
import { Frame } from '@nativescript/core/ui/frame'
import Vue from 'vue'

export const PAGE_REF = '__vuePageRef__'

const componentId = vm => {
  const result = vm && (vm.$options.name || vm.$options.__file || vm.$options._componentTag || vm.nativeView && vm.nativeView.typeName)
  if (!result) debugger
  return result
}

/** @returns {import('vue/types/vue').CombinedVueInstance<Vue, ReturnType<import('./frame')['default']['data']>, import('./frame')['default']['methods'], {}, Record<keyof import('./frame')['default']['props'], any>>} */
function findParentFrame(vm) {
  let frame = vm.$parent

  while (frame && frame.$options.name !== 'Frame') {
    frame = frame.$parent
  }

  return frame
}

export default {
  name: 'NativePage',
  // beforeCreate() {
  //   const parentFrame = findParentFrame(this)
  //   console.log(`➕ beforeCreate NativePage, vnode context ${componentId(this.$vnode && this.$vnode.context)} parent Frame ${parentFrame && parentFrame.id}`)
  // },
  render(h) {
    return h(
      'NativePage',
      {
        attrs: this.$attrs,
        on: this.$listeners
      },
      this.$slots.default
    )
  },
  mounted() {
    this.$el.nativeView[PAGE_REF] = this

    let nsVueFrameComponent = findParentFrame(this)
    if (!nsVueFrameComponent) return console.warn(`No <Frame> found among the parents of <Page> mounted by ${componentId(this.$vnode.context)}`)
    // console.log(`🏗 Running NativePage.mounted() for <Page> in template of ${componentId(this.$vnode && this.$vnode.context)} with parent Frame ${nsVueFrameComponent && nsVueFrameComponent.id}`)

    // Do not attempt to navigate if the Page is being created via navigation plugin
    let renderParent = this.$vnode.context
    while (renderParent && renderParent !== nsVueFrameComponent) {
      if (renderParent.$options.name === 'NavigationEntry')
        return console.log(`\tNo navigation action to perform, Page is being rendered by a NavigationEntry`)
      renderParent = renderParent.$vnode && renderParent.$vnode.context
    }

    // we only need call this for the "defaultPage" of the frame
    // which is equivalent to testing if any page is "current" in the frame
    if (!nsVueFrameComponent.firstPageMounted && !nsVueFrameComponent.$el.nativeView.currentPage) {
      nsVueFrameComponent.firstPageMounted = true
      nsVueFrameComponent.notifyFirstPageMounted(this)
    } else {
      // Existing <Page> child of frame was completely replaced
      nsVueFrameComponent.navigate({
        backstackVisible: nsVueFrameComponent.backstackVisible,
        clearHistory: true,
        animated: true,
        transition: {
          name: nsVueFrameComponent.$attrs.replaceTransition || 'fade'
        },
        create: () => this.$el.nativeView
      })
    }
  }
}
