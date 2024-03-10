// @ts-check
import { Placeholder } from '@nativescript/core'

/**
 * @param {import('vue').ComponentOptions | string} component
 * @returns {string}
 */
function getComponentName(component) {
  if (typeof component === 'string') return component
  if (component.name) return component.name
  if (component.__file) {
    const fileNameMatch = component.__file.match(/\w+(?=\.vue)/)
    if (fileNameMatch) return fileNameMatch[0]
  }
  return 'Unknown'
}

const REPLACE_PLACEHOLDER_TIMEOUT = 7500

/**
 * This function deals with async components passed to navigation or modal presentation methods.
 * [Async components](https://vuejs.org/v2/guide/components-dynamic-async.html#Async-Components)
 * will initially render as a <Placeholder> View in NativeScript. Attempting to show a modal with a
 * <Placeholder> as the root of the `navEntryInstance` will cause a crash. Navigation is more strict
 * because the View being navigated to must have a <Page> at its root not just any non-Placeholder
 * View. Our job here is to determine if the component being navigated to or shown modally is an
 * async component and if so wait for the <Placeholder> to be replaced in a future render cycle
 * before returning and allowing the calling method to pass the nativeView to NativeScript. If
 * provided, we check that the non-Placeholder View matches the required one as a final step.
 *
 * @template {import('@nativescript/core').View} R
 * @param {import('vue/types/vue').CombinedVueInstance<import('nativescript-vue').NativeScriptVue<R>, {}, {}, {}, {}>} navEntryInstance
 * @param {import('vue').ComponentOptions<import('nativescript-vue').NativeScriptVue> | string} component Reference to the component passed by the user, to provide the user with more informative errors
 * @param {new (...args: any[]) => R} [requiredClass] Constraint on which View subclass the users component must return as its root. If violated a descriptive error will be thrown.
 * @returns {Promise<R>}
 */
export async function ensureCorrectView(
  navEntryInstance,
  component,
  requiredClass
) {
  const componentName = getComponentName(component)
  let caughtErr, loadPageTimeoutErr

  try {
    while (navEntryInstance.nativeView instanceof Placeholder) {
      // Start a timeout incase the View doesn't seem to be re-rendering. Create the error/stack
      // trace here as in the the setTimeout callback the stack trace may be incomplete due to NS/V8
      if (loadPageTimeoutErr === undefined) {
        const timeoutErr = new Error(
          `root <Placeholder> view from the async component ${componentName} still not replaced after ${REPLACE_PLACEHOLDER_TIMEOUT}ms`
        )
        loadPageTimeoutErr = setTimeout(
          () => console.error(timeoutErr),
          REPLACE_PLACEHOLDER_TIMEOUT
        )
      }
      await new Promise(resolve =>
        navEntryInstance.$once('hook:updated', resolve)
      )
    }
  } catch (error) {
    caughtErr = error
  }

  clearTimeout(loadPageTimeoutErr)

  // Now evaluate if the root view is OK
  if (
    caughtErr ||
    (requiredClass && !(navEntryInstance.nativeView instanceof requiredClass))
  ) {
    navEntryInstance.$destroy()
    throw (
      caughtErr ||
      new Error(
        `Root View of component <${componentName}> on navEntryInstance must be an <${requiredClass.name}>, but got <${this.$el.nativeView.constructor.name}> (Note these constructor names may be uglified by your bundler)`
      )
    )
  }

  return navEntryInstance.nativeView
}
