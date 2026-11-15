import { useEffect, useRef } from 'react'

/** True only on renders where one of `deps` changed (e.g. region or record switch), so
 *  charts animate for real data changes but not on every month step during playback. */
export function useAnimateOnChange(deps: unknown[]) {
  const prev = useRef<unknown[] | null>(null)
  const changed = !prev.current || deps.some((d, i) => d !== prev.current![i])
  useEffect(() => { prev.current = deps })
  return changed
}
