import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from '../config'

const socket = io(API_URL)

interface Message {
  userName: string
  message: string
  time: string
}

const ChatBox = ({ meetingCode, userName }: { meetingCode: string, userName: string }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    socket.emit('join-meeting', meetingCode)

    socket.on('receive-message', (data: Message) => {
      setMessages(prev => [...prev, data])
    })

    socket.on('user-joined', (data: any) => {
      setMessages(prev => [...prev, {
        userName: 'System',
        message: data.message,
        time: new Date().toISOString()
      }])
    })

    return () => {
      socket.emit('leave-meeting', meetingCode)
      socket.off('receive-message')
      socket.off('user-joined')
    }
  }, [meetingCode])

  const sendMessage = () => {
    if (!input.trim()) return
    socket.emit('send-message', {
      meetingCode,
      message: input,
      userName
    })
    setInput('')
  }

  return (
    <div style={{ background: '#1a1a2e', padding: '20px', borderRadius: '10px', width: '350px' }}>
      <h3 style={{ color: 'white' }}>💬 Chat</h3>
      <div style={{ height: '300px', overflowY: 'auto', marginBottom: '10px', background: '#0f3460', padding: '10px', borderRadius: '5px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <b style={{ color: '#e94560' }}>{msg.userName}:</b>
            <span style={{ color: 'white' }}> {msg.message}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type message..."
          style={{ flex: 1, padding: '8px', borderRadius: '5px', border: 'none', marginRight: '5px' }}
        />
        <button
          onClick={sendMessage}
          style={{ padding: '8px 15px', background: '#e94560', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default ChatBox