import { warn } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'

import { once, isDef, isUndef, isObject, toNumber } from 'shared/util'

import {
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass
} from 'web/runtime/transition-util'


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// TODO:
// - Commit fixes here (maybe with a better solution than requestAnimationFrame and getAnimations)
//   https://nativescripting.com/posts/nativescript-vue-transitions
// - Commit fixes in ViewNode.js (actually provide an implementation for removeAttribute not just ()
//   => false, as this is what's causing <transition>s to always need a class

// This is an alternative to the getAnimations + setTimeout + requestAnimationFrame checking
// getAnimations loop, but the problem with just getting the animations duration and doing a
// setTimeout equal to the duration of the animation is that often NativeScript actually hasn't
// finished the animation within its duration. This causes the animation to get cancelled when the
// animation class is removed, causing flickering or disappearance

// Define window.getComputedStyle temporarily to allow whenTransitionEnds to run correctly
// const whenTransitionEndsWrapped = function () {
//   global['window'] = {
//     getComputedStyle(el) {
//       // The style attributes that whenTransitionEnds callee `getTransitionInfo` depends on (e.g.
//       // animationDuration, animationDelay) to determine how long the transition will actually take
//       // to complete are stored as direct properties of the native view in NativeScript.
//       return el.nativeView
//     }
//   }
//   whenTransitionEnds(...arguments)
//   delete global['window']
// }

const getAnimations = el => el.nativeView._cssState._appliedAnimations.filter(aa => aa._isPlaying && aa.iterations === 1).flatMap(aa => aa.animations)

export function enter(vnode, toggleDisplay) {
  const el = vnode.elm

  // call leave callback now
  if (isDef(el._leaveCb)) {
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  const data = resolveTransition(vnode.data.transition)

  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  if (isDef(el._enterCb) || el.nodeType !== 1) {
    return
  }

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    leaveToClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  let context = activeInstance
  let transitionNode = activeInstance.$vnode
  while (transitionNode && transitionNode.parent) {
    transitionNode = transitionNode.parent
    context = transitionNode.context
  }

  const isAppear = !context._isMounted || !vnode.isRootInsert

  if (isAppear && !appear && appear !== '') {
    return
  }

  const startClass = isAppear && appearClass ? appearClass : enterClass
  const activeClass =
    isAppear && appearActiveClass ? appearActiveClass : enterActiveClass
  const toClass = isAppear && appearToClass ? appearToClass : enterToClass

  const beforeEnterHook = isAppear ? beforeAppear || beforeEnter : beforeEnter
  const enterHook = isAppear
    ? typeof appear === 'function'
      ? appear
      : enter
    : enter
  const afterEnterHook = isAppear ? afterAppear || afterEnter : afterEnter
  const enterCancelledHook = isAppear
    ? appearCancelled || enterCancelled
    : enterCancelled

  const explicitEnterDuration = toNumber(
    isObject(duration) ? duration.enter : duration
  )

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }

  const expectsCSS = css !== false
  const userWantsControl = getHookArgumentsLength(enterHook)

  const cb = (el._enterCb = once(() => {
    if (expectsCSS) {
      // removeTransitionClass(el, toClass)
      removeTransitionClass(el, activeClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass)
      }
      enterCancelledHook && enterCancelledHook(el)
    } else {
      afterEnterHook && afterEnterHook(el)
    }
    el._enterCb = null
  }))

  if (!vnode.data.show) {
    // remove pending leave element on enter by injecting an insert hook
    mergeVNodeHook(vnode, 'insert', () => {
      const parent = el.parentNode
      const pendingNode =
        parent && parent._pending && parent._pending[vnode.key]
      if (
        pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb)
    })
  }

  // start enter transition
  beforeEnterHook && beforeEnterHook(el)
  if (expectsCSS) {
    addTransitionClass(el, startClass)
    addTransitionClass(el, activeClass)
    requestAnimationFrame(async () => {
      // TODO: Fix issue where this removeTransitionClass call actually runs before NativeScript
      // Animator has had time to finish the 0.01ms animation that gets applied on the leaveClass by
      // default, causing the leaveClass animation to be cancelled. Could probably be done using the
      // same nasty requestAnimationFrame and check nativeView animations hack used below but would
      // be much better to avoid that. It looks like there is nowhere the animation promise that
      // gets created as a result of applying the class gets exposed on the nativeView or returned
      // to a function we call though, so how can we await the animationFinishedPromise directly
      // without modifying NativeScript's animation-common.js?
      // while (getAnimations(el).length)
      //   await sleep(16)
      removeTransitionClass(el, startClass)
      if (!cb.cancelled) {
        addTransitionClass(el, toClass)
        if (!userWantsControl) {
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration)
          } else {
            // cb MUST NOT be called before the animation is actually complete, otherwise it will cancel it, causing a flash
            const time = Math.max(...getAnimations(el).map(a => a.duration || 0), 0)
            await new Promise(resolve => setTimeout(resolve, time))
            // Keep waiting until animations are actually done (the animation promise isn't actually
            // exposed to us so without modifying NativeScript / ui / animations this is the best we
            // can do)
            const checkCb = () => {
              if (getAnimations(el).length) {
                requestAnimationFrame(checkCb)
              } else {
                cb()
              }
            }
            requestAnimationFrame(checkCb)
          }
        }
      }
    })
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}

export function leave(vnode, rm) {
  const el = vnode.elm

  // call enter callback now
  if (isDef(el._enterCb)) {
    el._enterCb.cancelled = true
    el._enterCb()
  }

  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data) || el.nodeType !== 1) {
    return rm()
  }

  /* istanbul ignore if */
  if (isDef(el._leaveCb)) {
    return
  }

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    enterActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration
  } = data

  const expectsCSS = css !== false
  const userWantsControl = getHookArgumentsLength(leave)

  const explicitLeaveDuration = toNumber(
    isObject(duration) ? duration.leave : duration
  )

  if (process.env.NODE_ENV !== 'production' && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode)
  }

  const cb = (el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) {
      el.parentNode._pending[vnode.key] = null
    }
    if (expectsCSS) {
      // removeTransitionClass(el, leaveToClass)
      removeTransitionClass(el, leaveActiveClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, leaveClass)
      }
      leaveCancelled && leaveCancelled(el)
    } else {
      rm()
      afterLeave && afterLeave(el)
    }
    el._leaveCb = null
  }))

  if (delayLeave) {
    delayLeave(performLeave)
  } else {
    performLeave()
  }

  function performLeave() {
    // the delayed leave may have already been cancelled
    if (cb.cancelled) {
      return
    }
    // record leaving element
    if (!vnode.data.show) {
      ;(el.parentNode._pending || (el.parentNode._pending = {}))[
        vnode.key
      ] = vnode
    }
    beforeLeave && beforeLeave(el)
    if (expectsCSS) {
      addTransitionClass(el, leaveClass)
      addTransitionClass(el, leaveActiveClass)
      requestAnimationFrame(async () => {
        // while (getAnimations(el).length)
        //   await sleep(16)
        removeTransitionClass(el, leaveClass)
        if (!cb.cancelled) {
          addTransitionClass(el, leaveToClass)
          if (!userWantsControl) {
            if (isValidDuration(explicitLeaveDuration)) {
              setTimeout(cb, explicitLeaveDuration)
            } else {
              // cb MUST NOT be called before the animation is actually complete, otherwise it will cancel it, causing a flash
              const time = Math.max(...getAnimations(el).map(a => a.duration || 0), 0)
              await new Promise(resolve => setTimeout(resolve, time))
              // Keep waiting until animations are actually done (the animation promise isn't actually
              // exposed to us so without modifying NativeScript / ui / animations this is the best we
              // can do)
              const checkCb = () => {
                if (getAnimations(el).length) {
                  requestAnimationFrame(checkCb)
                } else {
                  cb()
                }
              }
              requestAnimationFrame(checkCb)
            }
          }
        }
      })
    }
    leave && leave(el, cb)
    if (!expectsCSS && !userWantsControl) {
      cb()
    }
  }
}

// only used in dev mode
function checkDuration(val, name, vnode) {
  if (typeof val !== 'number') {
    warn(
      `<transition> explicit ${name} duration is not a valid number - ` +
        `got ${JSON.stringify(val)}.`,
      vnode.context
    )
  } else if (isNaN(val)) {
    warn(
      `<transition> explicit ${name} duration is NaN - ` +
        'the duration expression might be incorrect.',
      vnode.context
    )
  }
}

function isValidDuration(val) {
  return typeof val === 'number' && !isNaN(val)
}

/**
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength(fn) {
  if (isUndef(fn)) {
    return false
  }
  const invokerFns = fn.fns
  if (isDef(invokerFns)) {
    // invoker
    return getHookArgumentsLength(
      Array.isArray(invokerFns) ? invokerFns[0] : invokerFns
    )
  } else {
    return (fn._length || fn.length) > 1
  }
}

/** 
 * On enter/leave, if v-show is TRUE, we immediately remove the vnode?
 */

function _enter(_, vnode) {
  if (vnode.data.show !== true) {
    enter(vnode)
  }
}

export default {
  create: _enter,
  activate: _enter,
  remove(vnode, rm) {
    /* istanbul ignore else */
    if (vnode.data.show !== true) {
      leave(vnode, rm)
    } else {
      rm()
    }
  }
}
