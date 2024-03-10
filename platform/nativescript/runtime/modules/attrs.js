import { extend } from 'shared/util'

function updateAttrs(oldVnode, vnode) {
  if (!oldVnode.data.attrs && !vnode.data.attrs) {
    return
  }
  let key, cur, old
  const elm = vnode.elm
  const oldAttrs = oldVnode.data.attrs || {}
  let attrs = vnode.data.attrs || {}
  // clone observed objects, as the user probably wants to mutate it
  if (attrs.__ob__) {
    attrs = vnode.data.attrs = extend({}, attrs)
  }

  for (key in attrs) {
    cur = attrs[key]
    old = oldAttrs[key]
    if (old !== cur) {
      elm.setAttribute(key, cur)
    }
  }
  // Commented to fix bug consistently produced by (4.1.44):
  // - Resetting tips
  // - Tapping on a "This location is closed" location
  // - Tapping on a paid location that triggers the free mins StackLayout to appear
  // - This would cause a Vue patch where we got to here with oldVnode = a view with colSpan = 3,
  //   and vnode = the StackLayout for the free mins button that had no definition for colSpan. 
  // - This would then call elm.setAttribute('colSpan'). Later when the layout algo was measuring
  //   where to position the free mins button (child of GridLayout) it led to the columnSpan and
  //   then child `right` offset passed around in the measure/layout functions being either
  //   undefined or NaN, ultimately causing layout glitches/crash when the bottom panel was
  //   displayed
  
  // Disabling doesn't seem to have broken anything else... all I can see that this was doing is
  // settinng the value of these missing attributes on the NEW child to `undefined` when they were
  // otherwise just going to use their default attributes, which in the case of colSpan actually
  // broke things...

  // for (key in oldAttrs) {
  //   if (attrs[key] == null) {
  //     elm.setAttribute(key)
  //   }
  // }
}

export default {
  create: updateAttrs,
  update: updateAttrs
}
