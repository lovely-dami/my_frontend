import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Periodically fetches data via `fetcher` and returns { data, error, loading, refresh }.
 * Polling keeps the shared/community state fresh without WebSockets.
 */
export function usePolling(fetcher, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const savedFetcher = useRef(fetcher)
  // 응답 순서 보장용. 느린 응답이 뒤늦게 도착해 최신 화면을 덮어쓰지 않도록,
  // 가장 마지막에 시작한 요청의 결과만 반영한다.
  const seq = useRef(0)

  // Keep the latest fetcher without re-subscribing the interval.
  useEffect(() => {
    savedFetcher.current = fetcher
  })

  const refresh = useCallback(async () => {
    const my = ++seq.current
    try {
      const result = await savedFetcher.current()
      if (my === seq.current) {
        setData(result)
        setError(null)
      }
      return result
    } catch (err) {
      if (my === seq.current) setError(err)
      throw err
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    let inFlight = false
    // 백그라운드 탭(화면 잠금·앱 전환)에서는 폴링을 멈춰 서버 부하를 줄인다.
    // inFlight: 느린 네트워크에서 이전 요청이 끝나기 전에 다음 폴링이 겹쳐
    // 요청이 쌓이는 것을 막는다.
    const tick = () => {
      if (!active || document.hidden || inFlight) return
      inFlight = true
      refresh()
        .catch(() => {})
        .finally(() => { inFlight = false })
    }
    tick()
    const id = setInterval(tick, intervalMs)
    // 다시 화면이 보이면 즉시 한 번 갱신
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refresh, setData }
}
