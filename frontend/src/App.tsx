import { useEffect, useState } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import MeetingRoom from './pages/MeetingRoom'
import { fetchProfile, joinMeetingByCode } from './api/meetings'

const readJoinParam = () => {
  const value = new URLSearchParams(window.location.search).get('join')
  return value ? value.trim().toUpperCase() : ''
}

const clearJoinParam = () => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('join')) return
  url.searchParams.delete('join')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

const hasStoredToken = () => !!localStorage.getItem('token')

function App() {
  const [page, setPage] = useState(() => (hasStoredToken() ? 'dashboard' : 'login'))
  const [meetingCode, setMeetingCode] = useState('')
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [pendingJoin, setPendingJoin] = useState(readJoinParam)
  const [joinError, setJoinError] = useState('')
  const [authError, setAuthError] = useState('')

  const logout = () => {
    localStorage.removeItem('token')
    setUserName('')
    setUserId('')
    setMeetingCode('')
    setAuthError('')
    setPage('login')
  }

  const requireAuth = (nextPage: string) => {
    if (!hasStoredToken()) {
      setAuthError('Please log in first.')
      setPage('login')
      return
    }
    setAuthError('')
    setPage(nextPage)
  }

  const enterMeeting = (code: string, name: string, id = '') => {
    setMeetingCode(code)
    setUserName(name)
    if (id) setUserId(id)
    setPendingJoin('')
    setJoinError('')
    clearJoinParam()
    setPage('meeting')
  }

  const completePendingJoin = async (knownName = '', knownId = '') => {
    const token = localStorage.getItem('token')
    if (!pendingJoin) return false
    if (!token) {
      setPage('login')
      return false
    }

    try {
      const meeting = await joinMeetingByCode(pendingJoin)
      let name = knownName
      let id = knownId
      if (!name || !id) {
        const profile = await fetchProfile()
        name = name || profile.name
        id = id || profile._id
        setUserId(profile._id)
      }
      enterMeeting(meeting.meetingCode, name, id)
      return true
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401) {
        logout()
        return false
      }
      if (status === 404) setJoinError('That meeting ID does not exist.')
      else if (status === 410) setJoinError('This meeting has ended.')
      else setJoinError(err?.response?.data?.message || 'Unable to join that meeting.')
      setPendingJoin('')
      clearJoinParam()
      setPage('dashboard')
      return false
    }
  }

  useEffect(() => {
    if (pendingJoin) {
      void completePendingJoin()
      return
    }
    if (!hasStoredToken()) return
    void fetchProfile()
      .then((profile) => {
        setUserName(profile.name)
        setUserId(profile._id)
        if (page === 'login') setPage('dashboard')
      })
      .catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status === 401) logout()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoin])

  const handleAuthSuccess = async (user: { _id: string, name: string }) => {
    setAuthError('')
    setUserName(user.name)
    setUserId(user._id)
    const joined = await completePendingJoin(user.name, user._id)
    if (!joined) setPage('dashboard')
  }

  return (
    <div>
      {page !== 'meeting' && (
        <div style={{ textAlign: 'center', padding: '10px', background: '#0f3460' }}>
          <button
            onClick={() => setPage('login')}
            style={{ margin: '5px', padding: '8px 20px', cursor: 'pointer', background: page === 'login' ? '#e94560' : 'white', color: page === 'login' ? 'white' : 'black', border: 'none', borderRadius: '5px' }}
          >
            Login
          </button>
          <button
            onClick={() => setPage('register')}
            style={{ margin: '5px', padding: '8px 20px', cursor: 'pointer', background: page === 'register' ? '#e94560' : 'white', color: page === 'register' ? 'white' : 'black', border: 'none', borderRadius: '5px' }}
          >
            Register
          </button>
          <button
            onClick={() => requireAuth('dashboard')}
            style={{ margin: '5px', padding: '8px 20px', cursor: 'pointer', background: page === 'dashboard' ? '#e94560' : 'white', color: page === 'dashboard' ? 'white' : 'black', border: 'none', borderRadius: '5px' }}
          >
            Dashboard
          </button>
          {hasStoredToken() && (
            <button
              onClick={logout}
              style={{ margin: '5px', padding: '8px 20px', cursor: 'pointer', background: 'white', color: 'black', border: 'none', borderRadius: '5px' }}
            >
              Logout
            </button>
          )}
        </div>
      )}
      {authError && page === 'login' && (
        <div style={{ margin: '0 auto', maxWidth: '720px', padding: '10px 16px', background: '#7f1d1d', color: '#fecaca', textAlign: 'center' }}>
          {authError}
        </div>
      )}
      {joinError && page !== 'meeting' && (
        <div style={{ margin: '0 auto', maxWidth: '720px', padding: '10px 16px', background: '#7f1d1d', color: '#fecaca', textAlign: 'center' }}>
          {joinError}
        </div>
      )}
      {page === 'login' && <Login onAuthSuccess={handleAuthSuccess} />}
      {page === 'register' && <Register onAuthSuccess={handleAuthSuccess} />}
      {page === 'dashboard' && hasStoredToken() && (
        <Dashboard
          onJoinMeeting={enterMeeting}
          joinError={joinError}
          onAuthExpired={logout}
        />
      )}
      {page === 'meeting' && (
        <MeetingRoom
          meetingCode={meetingCode}
          userName={userName}
          userId={userId}
          onLeave={() => {
            setPage('dashboard')
            setMeetingCode('')
          }}
        />
      )}
    </div>
  )
}

export default App
