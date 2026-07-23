import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'
import Celebration from '../components/Celebration'
import { TALENT_CATEGORIES, TONES, ruleReason, parseGrantReason } from '../constants/talentRules'

// 시간대를 한국으로 고정한다. 서버가 '오늘'을 한국시간 자정 기준으로 판단하므로,
// 표시도 같은 기준이어야 한다(기기 시간대가 다르면 날짜가 하루 어긋나 보인다).
const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit',
  })

function TeacherPage() {
  const { data, refresh } = usePolling(() => apiFetch('/teacher/students/'), 12000)

  const [target, setTarget] = useState(null) // student being granted
  // 고른 규칙들 — { id, label, reason, amount, tone }
  const [picked, setPicked] = useState([])
  const [custom, setCustom] = useState('') // 직접 입력 사유
  const [customAmount, setCustomAmount] = useState(1)
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [celebrate, setCelebrate] = useState(false)
  const [showToday, setShowToday] = useState(false)
  const [pendingCancel, setPendingCancel] = useState(null) // 취소하려는 지급 내역
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const students = data?.students ?? []
  const today = data?.today ?? { total: 0, count: 0, grants: [] }

  const openGrant = (student) => {
    setTarget(student)
    setPicked([])
    setCustom('')
    setCustomAmount(1)
    setError('')
  }

  // 규칙 누르면 선택/해제 (여러 개 고를 수 있다)
  const toggleRule = (category, rule, id) => {
    setPicked((prev) =>
      prev.some((p) => p.id === id)
        ? prev.filter((p) => p.id !== id)
        : [...prev, {
            id,
            label: rule.label,
            reason: ruleReason(category.label, rule.label),
            amount: rule.amount,
            tone: category.tone,
          }],
    )
  }

  const bumpPicked = (id, delta) =>
    setPicked((prev) =>
      prev.map((p) => (p.id === id ? { ...p, amount: Math.max(1, p.amount + delta) } : p)),
    )

  const customTrimmed = custom.trim()
  const total =
    picked.reduce((sum, p) => sum + p.amount, 0) + (customTrimmed ? customAmount : 0)

  const handleGrant = async () => {
    const items = picked.map((p) => ({ reason: p.reason, amount: p.amount }))
    if (customTrimmed) items.push({ reason: customTrimmed, amount: customAmount })
    if (items.length === 0) {
      setError('규칙을 하나 이상 선택해 주세요.')
      return
    }
    setError('')
    setGranting(true)
    try {
      // 규칙이 여러 개여도 요청은 한 번 — 서버가 bulk_create 로 한 번에 저장한다.
      await apiFetch('/teacher/grant/', {
        method: 'POST',
        body: { student: target.id, items },
      })
      const name = target.username
      setTarget(null)
      await refresh()
      setToast({ icon: '🎉', text: `${name} 학생에게 ${total} 달란트를 주었어요!` })
      setCelebrate(true)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setGranting(false)
    }
  }

  // 잘못 준 달란트 되돌리기. 당일 여부는 서버가 다시 확인하므로, 자정을 넘긴 채
  // 켜둔 화면에서 눌러도 안전하게 거절된다(그 메시지를 그대로 보여준다).
  const handleCancel = async () => {
    const { id, student_name: name, amount } = pendingCancel
    setCancelError('')
    setCancelling(true)
    try {
      await apiFetch(`/teacher/grant/${id}/`, { method: 'DELETE' })
      setPendingCancel(null)
      await refresh()
      setToast({ icon: '↩️', text: `${name} 학생의 ${amount} 달란트를 취소했어요.` })
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setCancelError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-white to-emerald-50 px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <AppHeader title="우리 반 달란트" />

        {/* 오늘의 지급 요약 — 눌러서 상세 내역 펼치기 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowToday((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-gray-50 transition"
          >
            <span className="text-2xl">📅</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-800">오늘 준 달란트</p>
              <p className="text-xs text-gray-400 mt-0.5">{today.count}번 지급</p>
            </div>
            <span className="text-2xl font-extrabold text-amber-500">{today.total}</span>
            <span className={`text-gray-300 text-sm transition ${showToday ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showToday && (
            <div className="border-t border-gray-100">
              {today.grants.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-gray-400">
                  오늘은 아직 준 달란트가 없어요.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {today.grants.map((g) => {
                    const { category, detail } = parseGrantReason(g.reason)
                    return (
                      <li key={g.id} className="flex items-start gap-3 pl-5 pr-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">
                            {g.student_name}
                            <span className="ml-2 text-[11px] font-normal text-gray-300">
                              {timeLabel(g.created_at)}
                            </span>
                          </p>
                          {category ? (
                            <p className="mt-0.5 text-xs text-gray-500">
                              <span
                                className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${TONES[category.tone].tag}`}
                              >
                                {category.icon}
                              </span>{' '}
                              {detail}
                            </p>
                          ) : (
                            detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
                          )}
                        </div>
                        <span className="shrink-0 self-center text-sm font-extrabold text-emerald-600">
                          +{g.amount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelError('')
                            setPendingCancel(g)
                          }}
                          aria-label={`${g.student_name} 학생에게 준 ${g.amount} 달란트 취소`}
                          className="shrink-0 self-center w-7 h-7 rounded-full text-gray-300 hover:text-rose-500 hover:bg-rose-50 active:scale-95 transition text-xs leading-none"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {today.grants.length > 0 && (
                <p className="px-5 py-2 text-[11px] text-gray-400 bg-gray-50/70 border-t border-gray-50">
                  잘못 준 달란트는 ✕ 를 눌러{' '}
                  <b className="font-semibold text-gray-500">오늘 안에만</b> 취소할 수 있어요.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-500 px-1">
          담당 학생 <b className="text-sky-600">{students.length}</b>명 · 카드를 눌러 달란트를 주세요.
        </p>

        {students.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-sm text-gray-400">
            아직 배정된 학생이 없어요. 관리자에게 학생 배정을 요청하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openGrant(s)}
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-sky-200 active:scale-[0.99] transition px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-800 truncate">{s.username}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-emerald-600 font-semibold">받음 {s.received_talent}</span>
                    <span className="text-rose-500 font-semibold">기부 {s.donated_talent}</span>
                    <span className="text-amber-600 font-semibold">보유 {s.balance}</span>
                  </div>
                </div>
                <span className="shrink-0 text-sky-500 text-2xl font-light">＋</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 달란트 지급 모달 — 규칙을 여러 개 골라 한 번에 준다 */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !granting && setTarget(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h3 className="text-center font-bold text-gray-800 text-lg">
                {target.username} 에게 달란트 주기
              </h3>
              <p className="mt-0.5 text-center text-xs text-gray-400">
                규칙을 여러 개 골라도 돼요 · 다시 누르면 취소
              </p>
            </div>

            {/* 규칙 목록 (스크롤) */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {TALENT_CATEGORIES.map((cat) => {
                const tone = TONES[cat.tone]
                return (
                  <div key={cat.key}>
                    <p className={`px-1 mb-1.5 text-sm font-bold ${tone.header}`}>
                      {cat.icon} {cat.label}
                    </p>
                    <div className="space-y-1.5">
                      {cat.rules.map((rule, i) => {
                        const id = `${cat.key}-${i}`
                        const active = picked.some((p) => p.id === id)
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleRule(cat, rule, id)}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition ${
                              active ? tone.active : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                          >
                            <span
                              className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold ${
                                active
                                  ? 'bg-sky-500 border-sky-500 text-white'
                                  : 'border-gray-300 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{rule.label}</p>
                              {rule.hint && (
                                <p className="mt-0.5 text-[11px] text-gray-400">💡 {rule.hint}</p>
                              )}
                            </div>
                            <span
                              className={`shrink-0 text-xs font-extrabold px-2.5 py-1 rounded-full ${
                                rule.amount > 1
                                  ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              +{rule.amount}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 푸터 — 선택 요약 · 직접 입력 · 주기 */}
            <div className="px-5 pt-3 pb-5 border-t border-gray-100 shrink-0 space-y-3">
              {picked.length > 0 && (
                <ul className="max-h-32 overflow-y-auto space-y-1 -mx-1 px-1">
                  {picked.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${TONES[p.tone].tag}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{p.label}</span>
                      <button
                        type="button"
                        onClick={() => bumpPicked(p.id, -1)}
                        className="w-5 h-5 rounded-full bg-white/70 font-bold leading-none"
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-extrabold">{p.amount}</span>
                      <button
                        type="button"
                        onClick={() => bumpPicked(p.id, 1)}
                        className="w-5 h-5 rounded-full bg-white/70 font-bold leading-none"
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                        className="w-5 h-5 rounded-full bg-white/70 text-gray-400 leading-none"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="직접 입력 (선택)"
                  maxLength={200}
                  className="min-w-0 flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                {customTrimmed && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCustomAmount((a) => Math.max(1, a - 1))}
                      className="w-7 h-7 rounded-full bg-gray-100 font-bold text-gray-600"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-extrabold text-sky-600">
                      {customAmount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomAmount((a) => a + 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 font-bold text-gray-600"
                    >
                      ＋
                    </button>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <button
                type="button"
                onClick={handleGrant}
                disabled={granting || total < 1}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {granting ? '주는 중…' : total < 1 ? '규칙을 선택해 주세요' : `${total} 달란트 주기`}
              </button>

              <button
                type="button"
                onClick={() => setTarget(null)}
                disabled={granting}
                className="w-full py-2 text-sm text-gray-400 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 지급 취소 확인 — 한 번 더 묻는다. 목록에서 바로 지워지면 그 자체가 새로운 실수가 된다. */}
      {pendingCancel && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !cancelling && setPendingCancel(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs px-6 py-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl">↩️</p>
            <h3 className="mt-2 font-bold text-gray-800">이 달란트를 취소할까요?</h3>
            <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <p className="font-bold text-gray-800">{pendingCancel.student_name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {parseGrantReason(pendingCancel.reason).detail || '사유 없음'}
              </p>
              <p className="mt-1 font-extrabold text-rose-500">−{pendingCancel.amount} 달란트</p>
            </div>
            <p className="mt-2.5 text-[11px] text-gray-400">
              학생 화면에서도 바로 사라져요.
            </p>

            {cancelError && <p className="mt-2.5 text-xs text-red-500">{cancelError}</p>}

            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="mt-4 w-full py-3 rounded-xl bg-rose-500 text-white font-bold disabled:opacity-50 active:scale-[0.98] transition"
            >
              {cancelling ? '취소하는 중…' : '네, 취소할래요'}
            </button>
            <button
              type="button"
              onClick={() => setPendingCancel(null)}
              disabled={cancelling}
              className="mt-1 w-full py-2 text-sm text-gray-400 disabled:opacity-50"
            >
              그대로 둘래요
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg animate-badge-pop">
          {toast.icon} {toast.text}
        </div>
      )}

      <Celebration
        show={celebrate}
        variant="receive"
        onDone={() => setCelebrate(false)}
        duration={1400}
      />
    </div>
  )
}

export default TeacherPage
