const PRODUCTION_API_URL = 'https://intellmeet-backend-gs65.onrender.com'

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : PRODUCTION_API_URL)

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
]
