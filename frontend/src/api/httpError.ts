import axios from 'axios'

export const apiErrorMessage = (err: unknown, fallback: string) => {
  if (!axios.isAxiosError(err)) return fallback
  if (!err.response) {
    return 'Cannot reach the server. Confirm the backend is running at http://localhost:5000.'
  }
  const payload = err.response.data as { message?: string } | undefined
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message
  }
  if (err.response.status >= 500) {
    return 'The server could not complete that request. Try again later.'
  }
  return fallback
}
