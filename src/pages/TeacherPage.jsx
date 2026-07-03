import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'
import Celebration from '../components/Celebration'
import { TALENT_CATEGORIES, TONES, ruleReason } from '../constants/talentRules'

function TeacherPage() {
  const { data: students, refresh } = usePolling(() => apiFetch('/teacher/students/'), 12000)

  const [target, setTarget] = useState(null) // student being granted
  const [amount, setAmount] = useState(1)
  const [reason, setReason] = useState('')
  const [selectedId, setSelectedId] = useState(null) // 선택된 규칙 하이라이트용
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [celebrate, setCelebrate] = useState(false)

  const openGrant = (student) => {
    setTarget(student)
    setAmount(1)
    setReason('')
    setSelectedId(null)
    setError('')
  }

  const selectRule = (category, rule, id) => {
    setSelectedId(id)
    setAmount(rule.amount)
    setReason(ruleReason(category.label, rule.label))
  }

  const handleGrant = async () => {
    setError('')
    setGranting(true)
    try {
      await apiFetch('/teacher/grant/', {
        method: 'POST',
        body: { student: target.id, amount, reason },
      })
      const name = target.username
      setTarget(null)
      await refresh()
      setToast(`${name} 학생에게 ${amount} 달란트를 주었어요!`)
      setCelebrate(true)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setGranting(false)
    }
  }

  const list = students ?? []

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-white to-emerald-50 px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <AppHeader title="우리 반 달란트" />

        <p className="text-sm text-gray-500 px-1">
          담당 학생 <b className="text-sky-600">{list.length}</b>명 · 카드를 눌러 달란트를 주세요.
        </p>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-sm text-gray-400">
            아직 배정된 학생이 없어요. 관리자에게 학생 배정을 요청하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((s) => (
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

      {/* 달란트 지급 모달 — 규칙을 골라 달란트를 준다 */}
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
                규칙을 누르면 달란트가 자동으로 정해져요
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
                        const active = selectedId === id
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => selectRule(cat, rule, id)}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition ${
                              active
                                ? tone.active
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                          >
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

            {/* 푸터 — 선택 요약 · 수량 조절 · 주기 */}
            <div className="px-5 pt-3 pb-5 border-t border-gray-100 shrink-0 space-y-3">
              <input
                type="text"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setSelectedId(null) }}
                placeholder="사유 (규칙 선택 또는 직접 입력)"
                maxLength={200}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAmount((a) => Math.max(1, a - 1))}
                    className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold text-gray-600 active:scale-95"
                  >
                    −
                  </button>
                  <span className="text-2xl font-extrabold text-sky-600 w-9 text-center">{amount}</span>
                  <button
                    type="button"
                    onClick={() => setAmount((a) => a + 1)}
                    className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold text-gray-600 active:scale-95"
                  >
                    ＋
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleGrant}
                  disabled={granting || amount < 1}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold disabled:opacity-50 active:scale-[0.98] transition"
                >
                  {granting ? '주는 중…' : `${amount} 달란트 주기`}
                </button>
              </div>

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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg animate-badge-pop">
          🎉 {toast}
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
