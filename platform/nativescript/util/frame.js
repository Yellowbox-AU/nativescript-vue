/** Global list of frames by id. We keep an array for each frame id because if a user navigates to
 * the same component they are already on or to another component containing a frame with an id
 * matching one of those already mounted then we will otherwise loose the reference to the first
 * frame instance. */
const frames = {}

export function setFrame(id, frame) {
  frames[id] = frames[id] || []
  frames[id].unshift(frame)
}

/** @typedef {import('../runtime/components/frame')['default']} FrameOptions */

/** @returns {import('vue/types/vue').CombinedVueInstance<import('../../../').NativeScriptVue, ReturnType<FrameOptions['data']>, FrameOptions['methods'], {}, Record<keyof FrameOptions['props'], any>>} */
export function getFrame(id) {
  return frames[id] && frames[id][0]
}

export function deleteFrame(id, frame) {
  return frames[id].splice(frames[id].indexOf(frame), 1)
}
