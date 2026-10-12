import { useState } from 'react'
import axios from 'axios'
import { API_URL } from '../config'
import { apiErrorMessage } from '../api/httpError'

const Login = ({ onAuthSuccess }: { onAuthSuccess?: (user: { _id: string, name: string }) => void }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        email: trimmedEmail,
        password
      })
      localStorage.setItem('token', res.data.token)
      onAuthSuccess?.({ _id: res.data._id, name: res.data.name })
      if (!onAuthSuccess) alert('Login Success! 🎉')
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ background: '#1a1a2e', padding: '40px', borderRadius: '10px', width: '400px' }}>
        <h2 style={{ color: 'white', textAlign: 'center' }}>🤖 IntellMeet Login</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '10px', margin: '10px 0', borderRadius: '5px', border: 'none' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '10px', margin: '10px 0', borderRadius: '5px', border: 'none' }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ width: '100%', padding: '10px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            {busy ? 'Signing in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
