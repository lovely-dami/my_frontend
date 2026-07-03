// 달란트 지급 규칙 — 카테고리별 규칙과 달란트 수.
// 선생님이 규칙을 누르면 해당 달란트(amount)가 자동 선택되고, reason이 채워진다.
// 기본 1달란트, X2/X5 표기가 있던 규칙은 각각 2·5달란트로 설정.
// 규칙을 바꾸려면 이 파일만 고치면 된다(백엔드 변경 불필요).

export const TALENT_CATEGORIES = [
  {
    key: 'praise',
    label: '함께 찬양해요',
    icon: '🎵',
    tone: 'sky',
    rules: [
      { label: '신나게 율동해요', amount: 1 },
      { label: '온맘다해 찬양해요', amount: 1 },
      { label: '특송 (영상 가능)', amount: 5 },
    ],
  },
  {
    key: 'make',
    label: '함께 만들어요',
    icon: '🧹',
    tone: 'amber',
    rules: [
      { label: '예배에 늦지 않아요!', amount: 1 },
      { label: '늦잠 자는 친구 깨워서 함께 와요!', amount: 2 },
      { label: '깨끗한 천양원으로!', amount: 1, hint: '간식은 쓰레기통에! 책은 제자리에!' },
    ],
  },
  {
    key: 'worship',
    label: '함께 예배해요',
    icon: '🙏',
    tone: 'violet',
    rules: [
      { label: '봉헌 위원으로 섬겨요', amount: 1 },
      { label: '설교시간에 집중해요!', amount: 1 },
      { label: '공과공부 마무리 기도', amount: 1 },
      { label: '대표 기도', amount: 5 },
    ],
  },
  {
    key: 'love',
    label: '함께 사랑해요',
    icon: '💝',
    tone: 'rose',
    rules: [
      { label: '선생님들께 예의 바르게 행동해요', amount: 1 },
      { label: '선생님과 추억을 만들어요', amount: 1, hint: '같이 사진찍기' },
      { label: '친구에게 사랑의 말을 전해요', amount: 1 },
    ],
  },
  {
    key: 'watch',
    label: '함께 지켜보아요',
    icon: '🤝',
    tone: 'emerald',
    rules: [
      { label: '서로를 위해 기도해요!', amount: 1, hint: '학급회의를 통해 만든 규칙' },
    ],
  },
]

// 카테고리별 색상 클래스 — Tailwind가 정적으로 스캔할 수 있도록 리터럴 문자열로 둔다.
// (`bg-${tone}-100` 같은 동적 조합은 purge되므로 사용 금지)
export const TONES = {
  sky: {
    header: 'text-sky-700',
    tag: 'bg-sky-50 text-sky-700 border-sky-200',
    active: 'border-sky-400 bg-sky-50 ring-1 ring-sky-200',
  },
  amber: {
    header: 'text-amber-700',
    tag: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'border-amber-400 bg-amber-50 ring-1 ring-amber-200',
  },
  violet: {
    header: 'text-violet-700',
    tag: 'bg-violet-50 text-violet-700 border-violet-200',
    active: 'border-violet-400 bg-violet-50 ring-1 ring-violet-200',
  },
  rose: {
    header: 'text-rose-700',
    tag: 'bg-rose-50 text-rose-700 border-rose-200',
    active: 'border-rose-400 bg-rose-50 ring-1 ring-rose-200',
  },
  emerald: {
    header: 'text-emerald-700',
    tag: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    active: 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200',
  },
}

// reason 문자열 만들기: "함께 찬양해요 · 특송 (영상 가능)"
export function ruleReason(categoryLabel, ruleLabel) {
  return `${categoryLabel} · ${ruleLabel}`
}

// 학생 화면에서 reason을 카테고리 + 상세로 파싱한다.
// 매칭되는 카테고리가 없으면(직접 입력 등) category=null, detail=원문.
export function parseGrantReason(reason) {
  if (!reason) return { category: null, detail: '' }
  const category = TALENT_CATEGORIES.find(
    (c) => reason === c.label || reason.startsWith(`${c.label} · `),
  )
  if (!category) return { category: null, detail: reason }
  const detail = reason.slice(category.label.length).replace(/^\s*·\s*/, '')
  return { category, detail }
}
