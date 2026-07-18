// Base URL of the Django API. Override in production via VITE_API_URL.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

const TOKEN_KEY = 'hst_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

function extractMessage(data) {
  if (!data) return '요청을 처리할 수 없습니다.'
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  // DRF field errors: { field: ["msg"] }
  const first = Object.values(data)[0]
  if (Array.isArray(first)) return first[0]
  if (typeof first === 'string') return first
  return '요청을 처리할 수 없습니다.'
}

export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Token ${token}`
  }

  let response
  // 서버가 막혔을 때 무한 로딩 대신 일정 시간 뒤 에러를 띄운다.
  // 폴링 주기(5~15초)보다 훨씬 긴 대기는 의미가 없다 — 다음 폴링이 어차피 대체한다.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 0, null)
  } finally {
    clearTimeout(timeoutId)
  }

  if (response.status === 204) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    /* no body */
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(data), response.status, data)
  }
  return data
}

export { ApiError }
