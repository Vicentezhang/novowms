const getOrigin = () => {
  if (typeof window === 'undefined') return ''
  const injected = (window as any).__API_BASE__
  if (injected) return injected
  return window.location.origin
}
export const API_BASE = getOrigin()
