import { useState } from 'react'
import axios from 'axios'
import { API_URL } from '../config'
import { apiErrorMessage } from '../api/httpError'

const Register = ({ onAuthSuccess }: { onAuthSuccess?: (user: { _id: string, name: string }) => void }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || !trimmedEmail || !password) {
      setError('Name, email, and password are required')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await axios.post(`${API_URL}/api/auth/register`, {
        name: trimmedName,
        email: trimmedEmail,
        password
      })
      localStorage.setItem('token', res.data.token)
      onAuthSuccess?.({ _id: res.data._id, name: res.data.name })
      if (!onAuthSuccess) alert('Register Success! 🎉')
    } catch (err) {
      setError(apiErrorMessage(err, 'Registration failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ background: '#1a1a2e', padding: '40px', borderRadius: '10px', width: '400px' }}>
        <h2 style={{ color: 'white', textAlign: 'center' }}>🤖 IntellMeet Register</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', padding: '10px', margin: '10px 0', borderRadius: '5px', border: 'none' }}
          />
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
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '10px', margin: '10px 0', borderRadius: '5px', border: 'none' }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ width: '100%', padding: '10px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            {busy ? 'Creating account…' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register
