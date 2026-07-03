import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { COMMUNITY_STAGES } from '../constants/tree'
import CommunityTree from '../components/CommunityTree'
import Celebration from '../components/Celebration'
import AppHeader from '../components/AppHeader'
import { TONES, parseGrantReason } from '../constants/talentRules'

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StatBox({ label, value, accent }) {
  return (
    <div className="flex-1 text-center">
      <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{label}</p>
    </div>
  )
}

function StudentPage() {
  // 받은 달란트는 빠른 반영이 중요 → 5초. 공동체 나무는 15초(부하 절감).
  const dash = usePolling(() => apiFetch('/student/dashboard/'), 5000)
  const comm = usePolling(() => apiFetch('/community/'), 15000)

  const [tab, setTab] = useState('home') // 'home' | 'community'
  const [pendingLevel, setPendingLevel] = useState(null) // 아직 축하하지 않은 레벨업 단계
  const [donateOpen, setDonateOpen] = useState(false)
  const [amount, setAmount] = useState(1)
  const [message, setMessage] = useState('')
  const [donating, setDonating] = useState(false)
  const [donateError, setDonateError] = useState('')
  const [celebration, setCelebration] = useState(null)
  const [toast, setToast] = useState(null)

  const toastTimer = useRef(null)
  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  const openDonate = () => {
    if (balance < 1) {
      showToast('아직 기부할 달란트가 없어요. 선생님께 달란트를 받아보세요! 💛')
      return
    }
    setDonateError('')
    setDonateOpen(true)
  }

  // Detect newly received talent across polls to trigger a celebration.
  const prevReceived = useRef(null)
  useEffect(() => {
    const received = dash.data?.received_talent
    if (received == null) return
    if (prevReceived.current != null && received > prevReceived.current) {
      setCelebration({
        variant: 'receive',
        title: `+${received - prevReceived.current} 달란트 받았어요!`,
        subtitle: '선생님이 칭찬을 보내주셨어요 💛',
      })
    }
    prevReceived.current = received
  }, [dash.data?.received_talent])

  const handleDonate = async () => {
    setDonateError('')
    setDonating(true)
    try {
      await apiFetch('/student/donate/', { method: 'POST', body: { amount, message } })
      setDonateOpen(false)
      setMessage('')
      setAmount(1)
      await Promise.all([dash.refresh(), comm.refresh()])
      setCelebration({
        variant: 'donate',
        title: `${amount} 달란트 기부 완료!`,
        subtitle: '우리 공동체 나무가 더 자랐어요 💝',
      })
    } catch (err) {
      setDonateError(err.message)
    } finally {
      setDonating(false)
    }
  }

  const d = dash.data
  const received = d?.received_talent ?? 0
  const donated = d?.donated_talent ?? 0
  const balance = d?.balance ?? 0

  const c = comm.data
  const cStage = c ? Math.min(COMMUNITY_STAGES.length - 1, Math.max(0, c.stage)) : 0
  const communityInfo = COMMUNITY_STAGES[cStage]
  const cProgress = c ? Math.min((c.total_donated / c.goal) * 100, 100) : 0

  // 공동체 나무 레벨업 감지 (직전 단계를 ref로 추적).
  // 변화 감지 시 pendingLevel만 설정하고, 실제 축하 노출/배지는 렌더에서 tab에 따라 파생한다.
  // (effect 안에서 조건부 setState를 피해 cascading 렌더를 방지)
  // - 첫 로딩은 기준선만 잡고 축하 X (이미 높은 나무에 헛축하 방지)
  // - 홈에서 레벨업되면 pendingLevel이 남아 공동체 탭에 배지 → 탭 열면 그때 축하
  const prevCommStage = useRef(null)
  const commLoaded = comm.data != null
  useEffect(() => {
    if (!commLoaded) return
    if (prevCommStage.current == null) {
      prevCommStage.current = cStage // 기준선
      return
    }
    if (cStage > prevCommStage.current) {
      prevCommStage.current = cStage
      setPendingLevel(cStage)
    }
  }, [cStage, commLoaded])

  // tab에 따라 파생: 공동체 탭이면 축하 노출, 아니면 탭에 배지
  const treeGrew = pendingLevel != null && tab !== 'community'
  const showLevelUp = pendingLevel != null && tab === 'community'

  return (
    <div className="min-h-svh bg-gradient-to-b from-emerald-50 via-white to-amber-50 px-4 pt-4 pb-24">
      <div className="max-w-md mx-auto space-y-5">
        <AppHeader title={tab === 'home' ? '나의 달란트' : '공동체 나무'} />

        {(dash.error || comm.error) && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 text-center">
            ⚠️ 잠시 연결이 원활하지 않아요. 자동으로 다시 시도하고 있어요…
          </div>
        )}

        {tab === 'home' && (
          <>
            {/* 달란트 요약 */}
            <section className="bg-white rounded-3xl shadow-xl shadow-emerald-100/60 border border-emerald-100 overflow-hidden">
              <div className="flex divide-x divide-gray-100 px-2 py-5">
                <StatBox label="받은 달란트" value={received} accent="text-emerald-600" />
                <StatBox label="기부한 달란트" value={donated} accent="text-rose-500" />
                <StatBox label="기부 가능" value={balance} accent="text-amber-500" />
              </div>
              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={openDonate}
                  className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-md transition active:scale-[0.98] ${
                    balance < 1
                      ? 'bg-gradient-to-r from-gray-300 to-gray-300 shadow-gray-100'
                      : 'bg-gradient-to-r from-rose-400 to-amber-400 shadow-rose-200 hover:from-rose-500 hover:to-amber-500'
                  }`}
                >
                  💝 공동체 나무에 기부하기
                </button>
                {balance < 1 && (
                  <p className="mt-2 text-center text-xs text-gray-400">
                    선생님께 달란트를 받으면 공동체 나무에 기부할 수 있어요.
                  </p>
                )}
              </div>
            </section>

            {/* 받은 달란트 이야기 */}
            <section className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
              <h2 className="px-5 py-4 font-bold text-gray-700 border-b border-gray-100">
                받은 달란트 이야기
              </h2>
              {d?.grants?.length ? (
                <ul className="divide-y divide-gray-50">
                  {d.grants.map((g) => {
                    const { category, detail } = parseGrantReason(g.reason)
                    return (
                      <li key={g.id} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">
                            🧑‍🏫 {g.teacher_name} 선생님
                          </span>
                          <span className="text-sm font-bold text-emerald-600">+{g.amount}</span>
                        </div>
                        {category && (
                          <span className={`mt-1 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONES[category.tone].tag}`}>
                            {category.icon} {category.label}
                          </span>
                        )}
                        {detail && <p className="mt-1 text-sm text-gray-500">“{detail}”</p>}
                        <p className="mt-0.5 text-xs text-gray-300">{formatDate(g.created_at)}</p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">
                  아직 받은 달란트가 없어요. 곧 선생님이 보내주실 거예요!
                </p>
              )}
            </section>
          </>
        )}

        {tab === 'community' && (
          <section className="rounded-3xl shadow-xl shadow-emerald-100/60 border border-emerald-100 overflow-hidden bg-white">
            {/* 큰 나무 — 성장이 잘 보이도록 화면을 크게 */}
            <div className="bg-gradient-to-b from-sky-50 via-emerald-50 to-amber-50 px-4 pt-5 pb-4">
              <div className="flex justify-center">
                <CommunityTree stage={cStage} size={280} />
              </div>
              <p className="mt-2 text-center text-emerald-700 font-extrabold text-lg">
                {communityInfo.icon} {communityInfo.label}
              </p>
              <p className="mt-0.5 text-center text-emerald-600/70 text-sm">
                {communityInfo.description}
              </p>
            </div>

            {/* 진행 현황 — 작게 */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold text-gray-700">
                  {c?.total_donated ?? 0}
                  <span className="text-gray-400"> / {c?.goal ?? 8} 달란트</span>
                </span>
                {c?.donor_count != null && <span>{c.donor_count}명 참여 💚</span>}
              </div>
              <div className="mt-2 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-amber-400 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${cProgress}%` }}
                />
              </div>
            </div>

            {/* 익명 기부 피드 */}
            <div className="px-4 pb-5">
              {c?.recent_donations?.length > 0 ? (
                <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                  {c.recent_donations.map((don) => (
                    <li key={don.id} className="bg-gray-50 rounded-xl px-3 py-2 text-xs">
                      <div className="flex items-center justify-between text-gray-600">
                        <span className="font-semibold text-gray-700">💫 {don.donor_alias}</span>
                        <span className="text-amber-600 font-semibold">{don.amount} 달란트</span>
                      </div>
                      {don.message && (
                        <p className="mt-0.5 text-gray-400">“{don.message}”</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-sm text-gray-400">
                  첫 번째 기부의 주인공이 되어 보세요! 🌱
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto flex gap-2 px-3 py-2">
          {[
            { key: 'home', icon: '🏠', label: '홈' },
            { key: 'community', icon: '🌳', label: '공동체' },
          ].map((t) => {
            const active = tab === t.key
            const showGrew = t.key === 'community' && treeGrew
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl text-xs font-bold transition-all duration-200 active:scale-95 ${
                  active
                    ? 'bg-emerald-50 text-emerald-600 shadow-inner ring-1 ring-emerald-200'
                    : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                {showGrew && (
                  <span className="absolute top-1 right-1/2 translate-x-5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow animate-heart-pulse">
                    자랐어요!
                  </span>
                )}
                <span className={`text-xl leading-none transition-transform ${active ? 'scale-110' : ''}`}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* 기부 모달 */}
      {donateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !donating && setDonateOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl px-6 py-6 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-3xl mb-2">💝</p>
            <h3 className="text-center font-bold text-gray-800">공동체 나무에 기부하기</h3>
            <p className="mt-1 text-center text-sm text-gray-500">
              보유 {balance} 달란트 중 나눠요
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAmount((a) => Math.max(1, a - 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                −
              </button>
              <span className="text-2xl font-extrabold text-emerald-600 w-12 text-center">{amount}</span>
              <button
                type="button"
                onClick={() => setAmount((a) => Math.min(balance, a + 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                +
              </button>
            </div>

            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="응원 메시지 (선택)"
              maxLength={200}
              className="mt-4 w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            {donateError && <p className="mt-2 text-sm text-red-500 text-center">{donateError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                disabled={donating}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDonate}
                disabled={donating || amount < 1 || amount > balance}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 to-amber-400 text-white font-bold disabled:opacity-50"
              >
                {donating ? '기부 중…' : '기부하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 안내 토스트 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55] max-w-[90%] bg-gray-900/95 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-lg animate-badge-pop text-center">
          {toast}
        </div>
      )}

      <Celebration
        show={!!celebration}
        variant={celebration?.variant}
        title={celebration?.title}
        subtitle={celebration?.subtitle}
        onDone={() => setCelebration(null)}
      />

      {/* 공동체 나무 레벨업 축하 (공동체 탭을 볼 때 노출) */}
      <Celebration
        show={showLevelUp}
        variant="levelup"
        title="공동체 나무가 자랐어요!"
        subtitle={pendingLevel != null ? `${COMMUNITY_STAGES[pendingLevel].icon} ${COMMUNITY_STAGES[pendingLevel].label}` : ''}
        onDone={() => setPendingLevel(null)}
        duration={2600}
      />
    </div>
  )
}

export default StudentPage
