import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from '../config'
import { meetingJoinUrl } from '../api/meetings'
import { addOrReplaceLocalTracks, createPeerConnection, replaceVideoTrack } from '../lib/webrtc'
import { acquireLocalMedia, describeMediaError, releaseLocalMedia } from '../lib/localMedia'
import './MeetingRoom.css'

const socket = io(API_URL)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket.disconnect()
  })
}

type ChatMessage = {
  userName: string
  message: string
  time: string
}

type RemoteParticipant = {
  id: string
  userName: string
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
  micAvailable: boolean
  stream?: MediaStream
}

type SignalingParticipant = {
  socketId: string
  userName?: string
  micOn?: boolean
  cameraOn?: boolean
  sharing?: boolean
  micAvailable?: boolean
  message?: string
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

type MeetingRoomProps = {
  meetingCode: string
  userName: string
  userId?: string
  onLeave: () => void
}

const formatTime = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Y'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const displayPeerName = (person: RemoteParticipant) => {
  if (person.userName?.trim()) return person.userName
  return `Guest ${person.id.slice(-4).toUpperCase()}`
}

function IconMic({ off = false }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10v1a3 3 0 0 0 5.2 2" />
      <path d="M15 10.2V11a3 3 0 0 1-.2 1.1" />
      <path d="M12 4a3 3 0 0 1 3 3v1" />
      <path d="M12 4a3 3 0 0 0-3 3v2" />
      <path d="M5 5l14 14" />
      <path d="M8 16.5A6.5 6.5 0 0 0 18 12" />
      <path d="M6.2 12A6.5 6.5 0 0 0 12 18.5V21" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="4" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </svg>
  )
}

function IconCamera({ off = false }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" />
      <path d="M15 11l5-3v8l-3-1.8" />
      <path d="M3 4l18 16" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10l6-3v10l-6-3z" />
    </svg>
  )
}

function IconScreen() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 19a4.5 4.5 0 0 1 5-4.2" />
    </svg>
  )
}

function IconLeave() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h11" />
      <path d="M7 9l-3 3 3 3" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

function RemoteMedia({
  stream,
  audioOnly = false,
  playToken = 0,
  onPlayBlocked
}: {
  stream?: MediaStream
  audioOnly?: boolean
  playToken?: number
  onPlayBlocked?: (blocked: boolean) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const onPlayBlockedRef = useRef(onPlayBlocked)
  onPlayBlockedRef.current = onPlayBlocked

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream || null
    el.muted = false
    if (!stream) {
      onPlayBlockedRef.current?.(false)
      return
    }
    const attemptPlay = () => {
      const playback = el.play()
      if (playback) {
        playback.then(() => onPlayBlockedRef.current?.(false)).catch(() => onPlayBlockedRef.current?.(true))
      }
    }
    attemptPlay()
    const onUnmute = () => attemptPlay()
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener('unmute', onUnmute)
    })
    return () => {
      stream.getAudioTracks().forEach((track) => {
        track.removeEventListener('unmute', onUnmute)
      })
    }
  }, [stream, playToken])

  if (!stream) return null
  return <video ref={ref} className={audioOnly ? 'is-audio-only' : ''} autoPlay playsInline />
}

const toRemote = (data: SignalingParticipant): RemoteParticipant => ({
  id: data.socketId,
  userName: data.userName || '',
  micOn: data.micOn !== false,
  cameraOn: data.cameraOn !== false,
  sharing: !!data.sharing,
  micAvailable: data.micAvailable !== false
})

const MeetingRoom = ({ meetingCode, userName, userId = '', onLeave }: MeetingRoomProps) => {
  const displayName = userName?.trim() || 'You'
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const micOnRef = useRef(false)
  const cameraOnRef = useRef(false)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const sessionRef = useRef(0)
  const blockedPeersRef = useRef(new Set<string>())

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [remotes, setRemotes] = useState<RemoteParticipant[]>([])
  const [micOn, setMicOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [micAvailable, setMicAvailable] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [shareError, setShareError] = useState('')
  const [chatError, setChatError] = useState('')
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [playToken, setPlayToken] = useState(0)
  const [connection, setConnection] = useState<ConnectionState>(
    socket.connected ? 'connected' : 'connecting'
  )
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia('(min-width: 961px)').matches)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [copied, setCopied] = useState('')
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 960px)').matches)

  const participantCount = remotes.length + 1
  const gridClass = participantCount === 1 ? 'cols-1' : participantCount === 2 ? 'cols-2' : 'cols-many'
  const joinUrl = meetingJoinUrl(meetingCode)
  const presenter = remotes.find((person) => person.sharing && person.stream)

  const closePeers = () => {
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    pendingIceRef.current.clear()
  }

  const flushIce = async (id: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(id) || []
    pendingIceRef.current.delete(id)
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // Ignore candidates that arrive before the remote description is ready.
      }
    }
  }

  const upsertRemote = (data: SignalingParticipant) => {
    setRemotes((prev) => {
      const next = toRemote(data)
      const exists = prev.find((item) => item.id === next.id)
      if (!exists) return [...prev, next]
      return prev.map((item) => item.id === next.id ? { ...item, ...next, stream: item.stream } : item)
    })
  }

  const markPlayBlocked = (id: string, blocked: boolean) => {
    if (blocked) blockedPeersRef.current.add(id)
    else blockedPeersRef.current.delete(id)
    setSoundBlocked(blockedPeersRef.current.size > 0)
  }

  const unlockRemoteSound = () => {
    setPlayToken((value) => value + 1)
  }

  const emitMediaState = (next?: { micOn?: boolean; cameraOn?: boolean; sharing?: boolean; micAvailable?: boolean }) => {
    const stream = localStreamRef.current
    const hasAudio = !!stream?.getAudioTracks().some((track) => track.readyState === 'live')
    socket.emit('media-state', {
      meetingCode,
      micOn: next?.micOn ?? micOnRef.current,
      cameraOn: next?.cameraOn ?? cameraOnRef.current,
      sharing: next?.sharing ?? !!screenStreamRef.current,
      micAvailable: next?.micAvailable ?? hasAudio
    })
  }

  const attachLocalTracksToPeers = async (stream: MediaStream) => {
    for (const [remoteId, pc] of peersRef.current) {
      const needsNegotiation = addOrReplaceLocalTracks(pc, stream)
      if (needsNegotiation && pc.signalingState === 'stable' && pc.remoteDescription) {
        try {
          const offer = await pc.createOffer()
          if (pc.signalingState !== 'stable') continue
          await pc.setLocalDescription(offer)
          socket.emit('webrtc-offer', { meetingCode, targetId: remoteId, offer })
        } catch {
          // Ignore failed renegotiation; the next offer/answer cycle can recover.
        }
      }
    }
  }

  const makePeer = useCallback((remoteId: string) => {
    const existing = peersRef.current.get(remoteId)
    if (existing) return existing

    const pc = createPeerConnection(
      (candidate) => {
        socket.emit('webrtc-ice', { meetingCode, targetId: remoteId, candidate })
      },
      (stream) => {
        setRemotes((prev) => prev.map((item) => (
          item.id === remoteId ? { ...item, stream } : item
        )))
      }
    )

    if (localStreamRef.current) addOrReplaceLocalTracks(pc, localStreamRef.current)
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0]
    if (screenTrack) {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video')
      if (sender) void sender.replaceTrack(screenTrack)
    }

    peersRef.current.set(remoteId, pc)
    return pc
  }, [meetingCode])

  const offerTo = useCallback(async (remoteId: string) => {
    const pc = makePeer(remoteId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc-offer', { meetingCode, targetId: remoteId, offer })
  }, [makePeer, meetingCode])

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    setIsSharing(false)
    const cameraTrack = cameraTrackRef.current
    if (cameraTrack) {
      await replaceVideoTrack(peersRef.current.values(), cameraTrack)
    }
    socket.emit('media-state', { meetingCode, micOn: micOnRef.current, cameraOn: cameraOnRef.current, sharing: false, micAvailable: micOnRef.current || !!localStreamRef.current?.getAudioTracks().length })
  }, [meetingCode])

  const startLocalMedia = useCallback(async (retryMissing = false) => {
    try {
      const result = await acquireLocalMedia({ retryMissing })
      localStreamRef.current = result.stream
      cameraTrackRef.current = result.stream.getVideoTracks().find((track) => track.readyState === 'live') || null
      const audioTrack = result.stream.getAudioTracks().find((track) => track.readyState === 'live') || null
      const keepMuted = retryMissing && !micOnRef.current && audioTrack?.enabled === false
      if (audioTrack) {
        audioTrack.enabled = keepMuted ? false : true
        audioTrack.onended = () => {
          const stillLive = !!localStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')
          if (stillLive) return
          micOnRef.current = false
          setMicAvailable(false)
          setMicOn(false)
          setCameraError((prev) => prev || 'The microphone stopped. Click Try again to reconnect it.')
          emitMediaState({ micOn: false, micAvailable: false })
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = result.stream
        await localVideoRef.current.play().catch(() => undefined)
      }
      await attachLocalTracksToPeers(result.stream)
      const nextMicOn = !!audioTrack && audioTrack.enabled
      micOnRef.current = nextMicOn
      cameraOnRef.current = result.hasVideo
      setMediaReady(result.hasAudio || result.hasVideo)
      setMicAvailable(result.hasAudio)
      setCameraOn(result.hasVideo)
      setMicOn(nextMicOn)
      setCameraError(result.warning)
      emitMediaState({
        micOn: nextMicOn,
        cameraOn: result.hasVideo,
        micAvailable: result.hasAudio
      })
    } catch (err: unknown) {
      micOnRef.current = false
      cameraOnRef.current = false
      setMediaReady(false)
      setCameraOn(false)
      setMicOn(false)
      setMicAvailable(false)
      setCameraError(await describeMediaError(err))
    }
  }, [meetingCode])

  const leaveMeeting = useCallback(() => {
    socket.emit('leave-meeting', meetingCode)
    releaseLocalMedia()
    localStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    closePeers()
    onLeave()
  }, [meetingCode, onLeave])

  useEffect(() => {
    document.body.classList.add('meeting-active')
    const media = window.matchMedia('(max-width: 960px)')
    const onChange = () => setIsNarrow(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => {
      document.body.classList.remove('meeting-active')
      media.removeEventListener('change', onChange)
    }
  }, [])

  useEffect(() => {
    const onConnect = () => setConnection('connected')
    const onDisconnect = () => setConnection('disconnected')
    const onMessage = (data: ChatMessage) => setMessages((prev) => [...prev, data])
    const onRoster = ({ participants }: { participants: SignalingParticipant[] }) => {
      participants.forEach((person) => {
        if (person.socketId && person.socketId !== socket.id) {
          upsertRemote(person)
          makePeer(person.socketId)
        }
      })
    }
    const onJoined = (data: SignalingParticipant & { signaling?: boolean }) => {
      if (!data.socketId || data.socketId === socket.id || data.signaling === false) return
      upsertRemote(data)
      setMessages((prev) => [...prev, {
        userName: 'System',
        message: data.message || `${data.userName || 'Someone'} joined the meeting`,
        time: new Date().toISOString()
      }])
      void offerTo(data.socketId)
    }
    const onLeft = (data: { socketId: string; message: string }) => {
      peersRef.current.get(data.socketId)?.close()
      peersRef.current.delete(data.socketId)
      pendingIceRef.current.delete(data.socketId)
      blockedPeersRef.current.delete(data.socketId)
      setSoundBlocked(blockedPeersRef.current.size > 0)
      setRemotes((prev) => prev.filter((item) => item.id !== data.socketId))
      setMessages((prev) => [...prev, {
        userName: 'System',
        message: data.message,
        time: new Date().toISOString()
      }])
    }
    const onOffer = async ({ fromId, offer }: { fromId: string, offer: RTCSessionDescriptionInit }) => {
      if (!fromId || fromId === socket.id) return
      const pc = makePeer(fromId)
      if (pc.signalingState === 'have-local-offer') {
        try {
          await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit)
        } catch {
          return
        }
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      await flushIce(fromId, pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { meetingCode, targetId: fromId, answer })
    }
    const onAnswer = async ({ fromId, answer }: { fromId: string, answer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(fromId)
      if (!pc || !answer) return
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
      await flushIce(fromId, pc)
    }
    const onIce = async ({ fromId, candidate }: { fromId: string, candidate: RTCIceCandidateInit }) => {
      if (!fromId || !candidate) return
      const pc = peersRef.current.get(fromId)
      if (!pc || !pc.remoteDescription) {
        const queued = pendingIceRef.current.get(fromId) || []
        pendingIceRef.current.set(fromId, [...queued, candidate])
        return
      }
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // Drop stale ICE candidates.
      }
    }
    const onMediaState = (data: { socketId: string, micOn: boolean, cameraOn: boolean, sharing: boolean, micAvailable?: boolean }) => {
      setRemotes((prev) => prev.map((item) => (
        item.id === data.socketId
          ? {
            ...item,
            micOn: data.micOn,
            cameraOn: data.cameraOn,
            sharing: data.sharing,
            micAvailable: data.micAvailable !== false
          }
          : item
      )))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('receive-message', onMessage)
    socket.on('room-participants', onRoster)
    socket.on('user-joined', onJoined)
    socket.on('user-left', onLeft)
    socket.on('webrtc-offer', onOffer)
    socket.on('webrtc-answer', onAnswer)
    socket.on('webrtc-ice', onIce)
    socket.on('media-state', onMediaState)
    if (socket.connected) setConnection('connected')

    const sessionId = ++sessionRef.current
    let cancelled = false
    const boot = async () => {
      await startLocalMedia()
      if (cancelled || sessionRef.current !== sessionId) return
      socket.emit('join-meeting', { meetingCode, userName: displayName, userId })
      emitMediaState()
    }
    void boot()

    return () => {
      cancelled = true
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('receive-message', onMessage)
      socket.off('room-participants', onRoster)
      socket.off('user-joined', onJoined)
      socket.off('user-left', onLeft)
      socket.off('webrtc-offer', onOffer)
      socket.off('webrtc-answer', onAnswer)
      socket.off('webrtc-ice', onIce)
      socket.off('media-state', onMediaState)
      socket.emit('leave-meeting', meetingCode)
      closePeers()
      queueMicrotask(() => {
        if (sessionRef.current === sessionId) {
          releaseLocalMedia()
          localStreamRef.current = null
        }
      })
    }
    // Peer helpers are recreated with the meeting code and are safe to read from this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, meetingCode, userId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatOpen])

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }, [cameraOn, mediaReady, isSharing])

  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current
    }
  }, [isSharing])

  const setTrackEnabled = (kind: 'audio' | 'video', enabled: boolean) => {
    localStreamRef.current?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.enabled = enabled
      })
  }

  const toggleMic = () => {
    unlockRemoteSound()
    const tracks = localStreamRef.current?.getAudioTracks().filter((track) => track.readyState === 'live') || []
    if (tracks.length === 0) {
      void startLocalMedia(true)
      return
    }
    const next = !micOnRef.current
    setTrackEnabled('audio', next)
    micOnRef.current = next
    setMicOn(next)
    setMicAvailable(true)
    emitMediaState({ micOn: next, micAvailable: true })
  }

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks().filter((track) => track.readyState === 'live') || []
    if (tracks.length === 0) {
      void startLocalMedia(true)
      return
    }
    const next = !cameraOnRef.current
    setTrackEnabled('video', next)
    cameraOnRef.current = next
    setCameraOn(next)
    emitMediaState({ cameraOn: next })
  }

  const startScreenShare = async () => {
    setShareError('')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      screenStreamRef.current = stream
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream
      setIsSharing(true)
      const [track] = stream.getVideoTracks()
      if (track) await replaceVideoTrack(peersRef.current.values(), track)
      socket.emit('media-state', { meetingCode, micOn: micOnRef.current, cameraOn: cameraOnRef.current, sharing: true, micAvailable: !!localStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live') })
      track?.addEventListener('ended', () => {
        void stopScreenShare()
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setShareError('Screen sharing was blocked by the browser.')
        return
      }
      setShareError(err instanceof Error ? err.message : 'Unable to share your screen.')
    }
  }

  const sendMessage = () => {
    const text = input.trim()
    if (!text) return
    if (!socket.connected) {
      setChatError('Chat is disconnected. Wait for the connection to recover.')
      return
    }
    socket.emit('send-message', { meetingCode, message: text, userName: displayName })
    setInput('')
    setChatError('')
  }

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1800)
    } catch {
      setCopied('')
    }
  }

  const statusClass = connection === 'connected' ? 'is-live' : connection === 'connecting' ? 'is-warn' : 'is-down'
  const statusLabel = connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'

  const localTile = useMemo(() => (
    <article className="video-tile" aria-label={`${displayName} camera`}>
      <video
        ref={localVideoRef}
        className={cameraOn && mediaReady ? '' : 'is-hidden'}
        autoPlay
        muted
        playsInline
      />
      {!(cameraOn && mediaReady) && (
        <div className="tile-placeholder">
          <div className="tile-avatar">{initials(displayName)}</div>
          <span>{cameraError || (cameraOn ? 'Starting camera…' : 'Camera is off')}</span>
        </div>
      )}
      <div className="tile-meta">
        <div className="tile-name">
          <span>{displayName}</span>
        </div>
        <span className="tile-badge is-you">You</span>
        {!micAvailable && mediaReady && (
          <span className="tile-badge">No mic</span>
        )}
        {micAvailable && !micOn && (
          <span className="tile-badge is-muted">
            <IconMic off />
            <span>Muted</span>
          </span>
        )}
      </div>
    </article>
  ), [cameraError, cameraOn, displayName, mediaReady, micAvailable, micOn])

  const remoteTiles = remotes.map((person) => {
    const name = displayPeerName(person)
    const showVideo = !!person.stream && (person.cameraOn || person.sharing)
    return (
      <article className="video-tile" key={person.id} aria-label={name}>
        {person.stream && (
          <RemoteMedia
            stream={person.stream}
            audioOnly={!showVideo}
            playToken={playToken}
            onPlayBlocked={(blocked) => markPlayBlocked(person.id, blocked)}
          />
        )}
        {!showVideo && (
          <div className="tile-placeholder">
            <div className="tile-avatar">{initials(name)}</div>
            <span>{person.cameraOn ? 'Connecting video…' : 'Camera is off'}</span>
          </div>
        )}
        <div className="tile-meta">
          <div className="tile-name">
            <span>{name}</span>
          </div>
          {person.micAvailable && !person.micOn && (
            <span className="tile-badge is-muted">
              <IconMic off />
              <span>Muted</span>
            </span>
          )}
        </div>
      </article>
    )
  })

  const sharingLayout = isSharing || presenter

  return (
    <div className="meeting-room">
      <header className="meeting-header">
        <div className="meeting-brand">
          <div className="meeting-logo" aria-hidden="true">IM</div>
          <div className="meeting-title-wrap">
            <h1 className="meeting-title">IntellMeet</h1>
            <span className="meeting-code">Meeting ID {meetingCode}</span>
          </div>
        </div>
        <div className="meeting-header-meta">
          <div className={`status-chip ${statusClass}`} role="status">
            <span className="status-dot" />
            <span>{statusLabel}</span>
          </div>
          <div className="count-chip">
            <IconPeople />
            <span>{participantCount}</span>
            <span className="optional">in call</span>
          </div>
          <button
            type="button"
            className="menu-btn"
            onClick={() => setInviteOpen(true)}
          >
            Invite
          </button>
          <div className="header-menu">
            <button
              type="button"
              className="menu-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Meeting options"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Options
            </button>
            {menuOpen && (
              <div className="menu-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => { setInviteOpen(true); setMenuOpen(false) }}>
                  Invite people
                </button>
                <button type="button" role="menuitem" onClick={() => void copyText(meetingCode, 'Meeting ID copied')}>
                  Copy meeting ID
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPeopleOpen(true)
                    setMenuOpen(false)
                    if (window.matchMedia('(max-width: 960px)').matches) setChatOpen(false)
                  }}
                >
                  View participants
                </button>
                <button type="button" role="menuitem" onClick={() => setConfirmLeave(true)}>
                  Leave meeting
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {copied && <div className="copy-toast" role="status">{copied}</div>}

      <div className="meeting-stage">
        <main className="video-workspace">
          {(cameraError || shareError) && (
            <div className="media-error" role="alert">
              <span>{cameraError || shareError}</span>
              {cameraError && (
                <button type="button" className="retry-btn" onClick={() => void startLocalMedia(true)}>
                  Try again
                </button>
              )}
            </div>
          )}
          {soundBlocked && (
            <div className="media-error is-audio" role="alert">
              <span>Browser playback blocked meeting audio. Click Enable sound so you can hear other participants.</span>
              <button type="button" className="retry-btn" onClick={unlockRemoteSound}>
                Enable sound
              </button>
            </div>
          )}

          {sharingLayout ? (
            <div className={`video-grid is-sharing ${gridClass}`}>
              <section className="screen-stage" aria-label="Shared screen">
                {isSharing ? (
                  <video ref={screenVideoRef} autoPlay playsInline muted />
                ) : (
                  <RemoteMedia
                    stream={presenter?.stream}
                    playToken={playToken}
                    onPlayBlocked={(blocked) => presenter && markPlayBlocked(presenter.id, blocked)}
                  />
                )}
                <div className="tile-meta">
                  <div className="tile-name">
                    <span>{isSharing ? `${displayName} is presenting` : `${displayPeerName(presenter as RemoteParticipant)} is presenting`}</span>
                  </div>
                </div>
              </section>
              <div className="filmstrip">
                {localTile}
                {remoteTiles}
              </div>
            </div>
          ) : (
            <div className={`video-grid ${gridClass}`}>
              {localTile}
              {remoteTiles}
            </div>
          )}
        </main>

        {chatOpen && (
          <aside className="side-panel" aria-label="Meeting chat">
            <div className="panel-header">
              <h2>Chat</h2>
              <button type="button" className="icon-btn" aria-label="Close chat" onClick={() => setChatOpen(false)}>
                <IconClose />
              </button>
            </div>
            <div className="chat-list">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  No messages yet. Say hello to everyone in the meeting.
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isSystem = msg.userName === 'System'
                  const isSelf = !isSystem && msg.userName === displayName
                  return (
                    <div
                      key={`${msg.time}-${index}`}
                      className={`chat-bubble ${isSelf ? 'is-self' : ''} ${isSystem ? 'is-system' : ''}`}
                    >
                      {!isSystem && (
                        <div className="chat-meta">
                          <span>{isSelf ? 'You' : msg.userName}</span>
                          <span>{formatTime(msg.time)}</span>
                        </div>
                      )}
                      <div>{msg.message}</div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-composer">
              <label className="sr-only" htmlFor="meeting-chat-input">Message</label>
              <textarea
                id="meeting-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Send a message"
                rows={1}
              />
              <button
                type="button"
                className="chat-send"
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                Send
              </button>
            </div>
            {chatError && <div className="media-error" role="alert">{chatError}</div>}
          </aside>
        )}

        {peopleOpen && (
          <aside className="side-panel" aria-label="Participants">
            <div className="panel-header">
              <h2>Participants ({participantCount})</h2>
              <button type="button" className="icon-btn" aria-label="Close participants" onClick={() => setPeopleOpen(false)}>
                <IconClose />
              </button>
            </div>
            <div className="participant-list">
              <div className="participant-row">
                <div className="participant-avatar">{initials(displayName)}</div>
                <div className="participant-copy">
                  <strong>{displayName} (You)</strong>
                  <span>{cameraOn ? 'Camera on' : 'Camera off'} · {!micAvailable ? 'No microphone' : micOn ? 'Mic on' : 'Muted'}</span>
                </div>
                <div className="participant-flags">
                  <IconMic off={!micOn} />
                  <IconCamera off={!cameraOn} />
                </div>
              </div>
              {remotes.map((person) => {
                const name = displayPeerName(person)
                return (
                  <div className="participant-row" key={person.id}>
                    <div className="participant-avatar">{initials(name)}</div>
                    <div className="participant-copy">
                      <strong>{name}</strong>
                      <span>{person.sharing ? 'Presenting' : person.cameraOn ? 'Camera on' : 'Camera off'} · {!person.micAvailable ? 'No microphone' : person.micOn ? 'Mic on' : 'Muted'}</span>
                    </div>
                    <div className="participant-flags">
                      <IconMic off={!person.micOn} />
                      <IconCamera off={!person.cameraOn} />
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        {isNarrow && (chatOpen || peopleOpen) && (
          <button
            type="button"
            className="backdrop"
            aria-label="Close panel"
            onClick={() => {
              setChatOpen(false)
              setPeopleOpen(false)
            }}
          />
        )}
      </div>

      <footer className="control-bar">
        <div className="control-cluster" role="toolbar" aria-label="Meeting controls">
          <button
            type="button"
            className={`ctrl-btn ${micOn ? '' : 'is-off'}`}
            aria-pressed={micAvailable ? !micOn : false}
            aria-label={!micAvailable ? 'Enable microphone' : micOn ? 'Mute microphone' : 'Unmute microphone'}
            title={!micAvailable ? 'Enable microphone' : micOn ? 'Mute microphone' : 'Unmute microphone'}
            onClick={toggleMic}
            disabled={!mediaReady && !micAvailable}
          >
            <IconMic off={!micOn} />
            <span className="ctrl-label">{!micAvailable ? 'Enable mic' : micOn ? 'Mic' : 'Unmute'}</span>
          </button>
          <button
            type="button"
            className={`ctrl-btn ${cameraOn ? '' : 'is-off'}`}
            aria-pressed={!cameraOn}
            aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            onClick={toggleCamera}
            disabled={!mediaReady}
          >
            <IconCamera off={!cameraOn} />
            <span className="ctrl-label">{cameraOn ? 'Camera' : 'Start video'}</span>
          </button>
          <button
            type="button"
            className={`ctrl-btn ${isSharing ? 'is-active' : ''}`}
            aria-pressed={isSharing}
            aria-label={isSharing ? 'Stop sharing screen' : 'Share screen'}
            title={isSharing ? 'Stop sharing screen' : 'Share screen'}
            onClick={isSharing ? () => void stopScreenShare() : () => void startScreenShare()}
          >
            <IconScreen />
            <span className="ctrl-label">{isSharing ? 'Stop' : 'Share'}</span>
          </button>
          <button
            type="button"
            className={`ctrl-btn ${chatOpen ? 'is-active' : ''}`}
            aria-pressed={chatOpen}
            aria-label="Toggle chat"
            title="Chat"
            onClick={() => {
              setChatOpen((open) => !open)
              if (isNarrow) setPeopleOpen(false)
            }}
          >
            <IconChat />
            <span className="ctrl-label">Chat</span>
          </button>
          <button
            type="button"
            className={`ctrl-btn ${peopleOpen ? 'is-active' : ''}`}
            aria-pressed={peopleOpen}
            aria-label="Toggle participants"
            title="Participants"
            onClick={() => {
              setPeopleOpen((open) => !open)
              if (isNarrow) setChatOpen(false)
            }}
          >
            <IconPeople />
            <span className="ctrl-label">People</span>
          </button>
          <button
            type="button"
            className={`ctrl-btn ${inviteOpen ? 'is-active' : ''}`}
            aria-pressed={inviteOpen}
            aria-label="Invite people"
            title="Invite people"
            onClick={() => setInviteOpen(true)}
          >
            <IconPeople />
            <span className="ctrl-label">Invite</span>
          </button>
          <button
            type="button"
            className="ctrl-btn is-danger"
            aria-label="Leave meeting"
            title="Leave meeting"
            onClick={() => setConfirmLeave(true)}
          >
            <IconLeave />
            <span className="ctrl-label">Leave</span>
          </button>
        </div>
      </footer>

      {inviteOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-labelledby="invite-title">
            <h2 id="invite-title">Invite people</h2>
            <p>Share this meeting ID or link. The other person must log in, then they can join the same room.</p>
            <label className="invite-label" htmlFor="invite-id">Meeting ID</label>
            <div className="invite-row">
              <input id="invite-id" readOnly value={meetingCode} />
              <button type="button" className="dialog-btn is-ghost" onClick={() => void copyText(meetingCode, 'Meeting ID copied')}>
                Copy ID
              </button>
            </div>
            <label className="invite-label" htmlFor="invite-link">Join link</label>
            <div className="invite-row">
              <input id="invite-link" readOnly value={joinUrl} />
              <button type="button" className="dialog-btn is-ghost" onClick={() => void copyText(joinUrl, 'Join link copied')}>
                Copy link
              </button>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-btn is-ghost" onClick={() => setInviteOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-copy">
            <h2 id="leave-title">Leave this meeting?</h2>
            <p id="leave-copy">Your camera and microphone will turn off, and you will return to the dashboard.</p>
            <div className="dialog-actions">
              <button type="button" className="dialog-btn is-ghost" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
              <button type="button" className="dialog-btn is-danger" onClick={leaveMeeting}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MeetingRoom
