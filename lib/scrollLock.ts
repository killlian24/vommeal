// Keeps the page behind an open sheet from scrolling. `overflow: hidden` on
// <body> is not enough on iOS, so the body is pinned with `position: fixed`
// at the current offset and the scroll position is restored afterwards.
// Counted, so nested dialogs unlock only when the last one closes.

let locks = 0
let saved = { y: 0, cssText: '' }

export function lockScroll() {
  if (locks++ > 0) return
  const body = document.body
  saved = { y: window.scrollY, cssText: body.style.cssText }
  body.style.position = 'fixed'
  body.style.top = `-${saved.y}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
}

export function unlockScroll() {
  if (locks === 0 || --locks > 0) return
  document.body.style.cssText = saved.cssText
  window.scrollTo(0, saved.y)
}
