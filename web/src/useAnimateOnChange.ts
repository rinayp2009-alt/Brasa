import { useRef } from 'react'

/** True for ~1.5 s after one of `deps` changes (e.g. region or record switch), so charts
 *  animate for real data changes (even if React renders twice) but not on every month
 *  step during playback. */
export function useAnimateOnChange(deps: unknown[]) {
  const prev = useRef<unknown[] | null>(null)
  const changedAt = useRef(0)
  if (!prev.current || deps.some((d, i) => d !== prev.current![i])) {
    prev.current = deps
    changedAt.current = Date.now()
  }
  return Date.now() - changedAt.current < 1500
}
