// @ts-check
import { isObject, isDef, isPrimitive } from 'shared/util'
import { getFrame } from '../util/frame'
import { updateDevtools } from '../util'
import { Page, Placeholder } from '@nativescript/core'
import { NavigationType } from '@nativescript/core/ui/frame/frame-common'
// import { ensureCorrectView } from './navigation-utils'

let sequentialCounter = 0

function serializeNavigationOptions(options) {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const allowed = ['backstackVisible', 'clearHistory']

  return Object.keys(options)
    .filter(key => allowed.includes(key))
    .map(key => {
      return `${key}: ${options[key]}`
    })
    .concat(`uid: ${++sequentialCounter}`)
    .join(', ')
}

export function getFrameInstance(frame) {
  // get the frame that we need to navigate
  // this can be a frame id (String)
  // a Vue ref to a frame
  // a Frame ViewNode
  // or a Frame instance
  if (isObject(frame) && isDef(frame.$el)) {
    frame = frame.$el.nativeView
  } else if (isPrimitive(frame)) {
    frame = require('@nativescript/core').Frame.getFrameById(frame)
  } else if (isDef(frame.nativeView)) {
    frame = frame.nativeView
  }
  // finally get the component instance for this frame
  return getFrame(frame.id)
}

export function findParentFrame(vm) {
  if (!vm) {
    return false
  }

  let entry = vm.$parent
  while (entry && entry.$options.name !== 'Frame') {
    entry = entry.$parent
  }

  return entry
}

export default {
  install(/** @type {import('../../..').NativeScriptVueConstructor} */ Vue) {
    Vue.navigateBack = Vue.prototype.$navigateBack = function (
      options,
      backstackEntry = null
    ) {
      const parentFrame = findParentFrame(this)
      const defaultOptions = {
        frame: parentFrame ? parentFrame : 'default'
      }
      options = Object.assign({}, defaultOptions, options)
      const frame = getFrameInstance(options.frame)

      frame.back(backstackEntry)
    }

    Vue.navigateTo = Vue.prototype.$navigateTo = function (
      component,
      options
    ) {
      const defaultOptions = {
        frame: 'default'
      }
      // build options object with defaults
      options = Object.assign({}, defaultOptions, options)

      const frame = getFrameInstance(options.frame)
      const key = serializeNavigationOptions(options)

      const navEntryInstance = new Vue({
        abstract: true,
        functional: true,
        name: 'NavigationEntry',
        parent: frame,
        frame,
        render: h =>
          h(component, {
            props: options.props,
            key
          })
      }).$mount()
      
      return new Promise((resolve, reject) => {
        /** @type {Page} */
        let page
        const resolveOnEvent = options.resolveOnEvent
        const onUpdate = () => {
          if (navEntryInstance.nativeView instanceof Page && navEntryInstance.nativeView !== page) {
            updateDevtools()

            const newPage = navEntryInstance.nativeView
            // Add cleanup handlers. Only destroy the navEntryInstance if this Page instance is
            // still the one at the root of the navEntryInstance
            newPage.on('navigatedFrom', e => {
              if (e.isBackNavigation && navEntryInstance.nativeView === newPage)
                navEntryInstance.$destroy()
            })
            newPage.disposeNativeView = new Proxy(newPage.disposeNativeView, {
              apply(target, thisArg, argArray) {
                // console.log(`➖ 🧭  newPage.disposeNativeView ($destroy navEntryInstance? ${navEntryInstance.nativeView === newPage})`)
                if (navEntryInstance.nativeView === newPage)
                  navEntryInstance.$destroy()
                return Reflect.apply(target, thisArg, argArray)
              }
            })

            /** The asyncFactory from which the <Page> was rendered, if there is one. */
            const asyncFactory = navEntryInstance._vnode.asyncFactory

            if (newPage && page) {
              // We had already navigated to a Page e.g. the loadingComp of an asyncFactory. We
              // don't want to replay the initial navigation transition and we don't want the
              // currently visible page to go into the backStack. We need to replace the page. NS
              // has an implementation of replacePage but it only accepts a moduleName, so it has
              // been copied here and refactored for the time being.
              // TODO: Replace with call to replacePage (NS >= 8.1.0-rc.0) https://github.com/NativeScript/NativeScript/commit/ffab4c31658f9be2137cae5a824f8e8c9bf7aef2
              /** @type {import('@nativescript/core').Frame} */
              const nativeFrame = frame.nativeView
              const currentBackstackEntry = nativeFrame._currentEntry;
              const newBackstackEntry = {
                entry: Object.assign({}, currentBackstackEntry.entry, { create: () => newPage }),
                resolvedPage: newPage,
                navDepth: currentBackstackEntry._navDepth,
                fragmentTag: currentBackstackEntry.fragmentTag,
                frameId: frame.id,
              };
              const navigationContext = {
                entry: newBackstackEntry,
                isBackNavigation: false,
                navigationType: NavigationType.replace,
              };
              nativeFrame._navigationQueue.push(navigationContext);
              nativeFrame._processNextNavigationEntry();
            } else {
              frame.navigate(Object.assign({}, options, { create: () => newPage }))
            }

            if (!asyncFactory || asyncFactory.resolved) {
              // Only resolve if the users resolveOnEvent occurs on the final destination component
              if (resolveOnEvent) {
                newPage.once(resolveOnEvent, () => resolve(newPage))
              } else {
                resolve(newPage)
              }
            }

            page = newPage
          } else if (navEntryInstance.nativeView && !(navEntryInstance.nativeView instanceof Placeholder) && !(navEntryInstance.nativeView instanceof Page)) {
            navEntryInstance.$off('hook:updated', onUpdate)
            reject(new Error(`navigateTo: Navigation destination rendered a <${navEntryInstance.nativeView.typeName}> where a <Page> was expected`))
            navEntryInstance.$destroy()
          }
        }
        navEntryInstance.$on('hook:updated', onUpdate)
        // non-asyncFactory user component will have already produced its nativeView at this point,
        // so we invoke the updated cb once ourselves manually
        onUpdate()
      })
    }
  }
}
