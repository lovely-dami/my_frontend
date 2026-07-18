import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { COMMUNITY_STAGES } from '../constants/tree'
import CommunityTree from '../components/CommunityTree'
import Celebration from '../components/Celebration'

/**
 * Event-day big screen — community tree only, no login or header.
 * Open `?display` on a projector/TV; it polls the public summary endpoint.
 */
function CommunityDisplayPage() {
  const { data, error } = usePolling(
    () => apiFetch('/community/display/', { auth: false }),
    10000,
  )

  const stage = data ? Math.min(COMMUNITY_STAGES.length - 1, Math.max(0, data.stage)) : 0
  const info = COMMUNITY_STAGES[stage]
  const total = data?.total_donated ?? 0
  const goal = data?.goal ?? 8
  const donors = data?.donor_count ?? 0
  const progress = Math.min((total / goal) * 100, 100)

  // 화면에 떠 있는 동안 단계가 오르면 큰 축하 (첫 로딩은 기준선만).
  const [celebrate, setCelebrate] = useState(false)
  const prevStage = useRef(null)
  useEffect(() => {
    if (data == null) return
    if (prevStage.current != null && stage > prevStage.current) {
      setCelebrate(true)
    }
    prevStage.current = stage
  }, [stage, data])

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-emerald-50 to-amber-50 text-gray-800 flex flex-col items-center justify-center px-6 py-4 overflow-hidden">
      <h1 className="text-emerald-700 font-extrabold tracking-tight text-2xl sm:text-3xl text-center">
        🌳 우리 공동체 나무
      </h1>
      <p className="mt-1 text-emerald-600/70 text-xs sm:text-base text-center">
        함께 나눈 사랑이 나무를 키워요
      </p>

      {/* 나무를 가장 크게 — 성장이 잘 보이도록 (높이 기준 400)
          데이터가 오기 전에 그리면 1단계 영상을 받다가 실제 단계 영상을 다시 받게 되어
          모바일에서 수 MB를 헛되이 쓴다. 자리만 잡아두고 단계가 정해진 뒤에 렌더한다. */}
      <div
        className="my-3 sm:my-4 w-full max-w-5xl flex justify-center"
        style={{ minHeight: 420 }}
      >
        {data ? (
          <CommunityTree stage={stage} height={420} />
        ) : (
          <div className="flex items-center text-emerald-600/60 text-lg">🌱 불러오는 중…</div>
        )}
      </div>

      <p className="text-amber-600 font-extrabold text-xl sm:text-3xl text-center">
        {info.icon} {info.label}
      </p>
      <p className="mt-1 text-emerald-700/70 text-sm sm:text-lg text-center">
        {info.description}
      </p>

      {/* 큰 숫자 */}
      <div className="mt-2 text-center">
        <p className="text-emerald-600 font-black leading-none tabular-nums">
          <span className="text-5xl sm:text-7xl">{total}</span>
          <span className="ml-2 text-2xl sm:text-4xl font-extrabold">달란트</span>
        </p>
        <p className="mt-1 text-gray-500 text-base sm:text-xl">
          {donors}명의 마음이 모였어요
        </p>
      </div>

      {/* 진행바 */}
      <div className="mt-3 w-full max-w-2xl">
        <div className="h-5 sm:h-6 bg-white rounded-full overflow-hidden shadow-inner border border-emerald-100">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-amber-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="mt-6 text-sm text-amber-600">
          ⚠️ 연결을 다시 시도하고 있어요…
        </p>
      )}

      <Celebration
        show={celebrate}
        variant="levelup"
        title="공동체 나무가 자랐어요!"
        subtitle={`${info.icon} ${info.label}`}
        onDone={() => setCelebrate(false)}
        duration={3200}
      />
    </div>
  )
}

export default CommunityDisplayPage
