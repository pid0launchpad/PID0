const configured = String(import.meta.env.VITE_ZUNON_API_ORIGIN || import.meta.env.VITE_PID0_API_ORIGIN || '').replace(/\/$/, '')

export function apiUrl(path) {
  return `${configured}${path}`
}

export const apiOrigin = configured
