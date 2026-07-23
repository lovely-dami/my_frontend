// Community tree growth videos (mp4 — smaller than GIF, smooth playback).
import community1 from '../assets/tree-characters/tree_1.mp4'
import community2 from '../assets/tree-characters/tree_2.mp4'
import community3 from '../assets/tree-characters/tree_3.mp4'
import community4 from '../assets/tree-characters/tree_4.mp4'

// ── Community tree (4 stages, driven by everyone's cumulative donations) ──
// 단계 판정(stage)과 목표(goal)는 백엔드가 내려준다 — 임계값은 서버 환경변수
// COMMUNITY_THRESHOLDS 하나로 관리하므로 프런트에 같은 숫자를 두지 않는다.
export const COMMUNITY_VIDEOS = [community1, community2, community3, community4]

// Community tree stages (4 stages, driven by everyone's donations)
export const COMMUNITY_STAGES = [
  { icon: '🌱', label: '씨앗을 심었어요', description: '우리의 나눔이 막 시작됐어요.' },
  { icon: '🌿', label: '함께 싹틔웠어요', description: '여러 친구의 마음이 모이고 있어요!' },
  { icon: '🌳', label: '무럭무럭 자라요', description: '나눔의 나무가 쑥쑥 자라고 있어요!' },
  { icon: '🎆', label: '활짝 피었어요!', description: '우리 모두의 사랑이 열매를 맺었어요!' },
]

// 응답이 오기 전 한 프레임 동안만 쓰이는 표시용 기본 목표치(서버 기본값과 동일).
export const COMMUNITY_GOAL_FALLBACK = 40
