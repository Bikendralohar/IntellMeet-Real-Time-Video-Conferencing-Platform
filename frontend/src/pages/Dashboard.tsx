import { useState, useEffect } from 'react'
import axios from 'axios'
import ChatBox from '../components/ChatBox'
import { API_URL } from '../config'
import { joinMeetingByCode } from '../api/meetings'

const Dashboard = ({
  onJoinMeeting,
  joinError,
  onAuthExpired
}: {
  onJoinMeeting: (code: string, name: string, userId?: string) => void
  joinError?: string
  onAuthExpired?: () => void
}) => {
  const [meetings, setMeetings] = useState([])
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinCodeError, setJoinCodeError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null)

  const [actionError, setActionError] = useState('')
  const token = localStorage.getItem('token')

  const handleUnauthorized = () => {
    localStorage.removeItem('token')
    onAuthExpired?.()
  }

  useEffect(() => {
    fetchMeetings()
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUser(res.data)
    } catch (err: any) {
      if (err?.response?.status === 401) handleUnauthorized()
    }
  }

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/meetings`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMeetings(res.data)
    } catch (err: any) {
      if (err?.response?.status === 401) handleUnauthorized()
    }
  }

  const createMeeting = async () => {
    if (!title.trim()) {
      setActionError('Enter a meeting title.')
      return
    }
    try {
      await axios.post(`${API_URL}/api/meetings`,
        { title: title.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setTitle('')
      setActionError('')
      fetchMeetings()
      alert('Meeting Created! 🎉')
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleUnauthorized()
        return
      }
      setActionError(err?.response?.data?.message || 'Unable to create that meeting.')
    }
  }

  const joinWithCode = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setJoinCodeError('Enter a meeting ID.')
      return
    }
    try {
      const meeting = await joinMeetingByCode(code)
      setJoinCodeError('')
      onJoinMeeting(meeting.meetingCode, user?.name, user?._id)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 404) setJoinCodeError('That meeting ID does not exist.')
      else if (status === 410) setJoinCodeError('This meeting has ended.')
      else if (status === 401) setJoinCodeError('Please log in before joining a meeting.')
      else setJoinCodeError('Unable to join that meeting.')
    }
  }

  return (
    <div style={{ padding: '20px', background: '#16213e', minHeight: '100vh', color: 'white' }}>
      <h1>🤖 IntellMeet Dashboard</h1>
      {user && <p>Welcome, <b>{user.name}</b>! 👋</p>}
      {(joinError || joinCodeError || actionError) && (
        <p style={{ color: '#fecaca' }}>{joinError || joinCodeError || actionError}</p>
      )}

      <div style={{ background: '#1a1a2e', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h3>Create New Meeting</h3>
        <input
          type="text"
          placeholder="Meeting Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '10px', width: '300px', borderRadius: '5px', border: 'none', marginRight: '10px' }}
        />
        <button
          onClick={createMeeting}
          style={{ padding: '10px 20px', background: '#e94560', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Create Meeting
        </button>
      </div>

      <div style={{ background: '#1a1a2e', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h3>Join with meeting ID</h3>
        <input
          type="text"
          placeholder="Meeting ID"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          style={{ padding: '10px', width: '300px', borderRadius: '5px', border: 'none', marginRight: '10px' }}
        />
        <button
          onClick={joinWithCode}
          style={{ padding: '10px 20px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Join
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ background: '#1a1a2e', padding: '20px', borderRadius: '10px', flex: 1 }}>
          <h3>My Meetings ({meetings.length})</h3>
          {meetings.length === 0 ? (
            <p>No meetings yet. Create one! 🚀</p>
          ) : (
            meetings.map((meeting: any) => (
              <div
                key={meeting._id}
                onClick={() => setSelectedMeeting(meeting)}
                style={{ background: selectedMeeting?._id === meeting._id ? '#e94560' : '#0f3460', padding: '15px', borderRadius: '8px', marginBottom: '10px', cursor: 'pointer' }}
              >
                <h4>📅 {meeting.title}</h4>
                <p>Code: <b>{meeting.meetingCode}</b></p>
                <p>Status: {meeting.status}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); onJoinMeeting(meeting.meetingCode, user?.name, user?._id) }}
                  style={{ padding: '8px 15px', background: '#e94560', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '5px' }}
                >
                  Join Meeting 🚀
                </button>
              </div>
            ))
          )}
        </div>

        {selectedMeeting && user && (
          <ChatBox
            meetingCode={selectedMeeting.meetingCode}
            userName={user.name}
          />
        )}
      </div>
    </div>
  )
}

export default Dashboard