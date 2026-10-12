import { ICE_SERVERS } from '../config'

export const createPeerConnection = (
  onIce: (candidate: RTCIceCandidate) => void,
  onTrack: (stream: MediaStream) => void
) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const inbound = new MediaStream()

  pc.onicecandidate = (event) => {
    if (event.candidate) onIce(event.candidate)
  }

  pc.ontrack = (event) => {
    const track = event.track
    if (!inbound.getTracks().some((item) => item.id === track.id)) {
      inbound.addTrack(track)
    }
    track.addEventListener('ended', () => {
      if (inbound.getTracks().some((item) => item.id === track.id)) {
        inbound.removeTrack(track)
      }
      onTrack(inbound)
    })
    onTrack(inbound)
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      pc.restartIce()
    }
  }

  return pc
}

export const addOrReplaceLocalTracks = (pc: RTCPeerConnection, stream: MediaStream) => {
  const senders = pc.getSenders()
  let needsNegotiation = false

  stream.getTracks().forEach((track) => {
    const matching = senders.find((item) => item.track?.kind === track.kind)
    if (matching) {
      if (matching.track?.id !== track.id) void matching.replaceTrack(track)
    } else {
      pc.addTrack(track, stream)
      needsNegotiation = true
    }
  })

  return needsNegotiation
}

export const replaceVideoTrack = async (
  peers: Iterable<RTCPeerConnection>,
  track: MediaStreamTrack | null
) => {
  const replacements: Promise<void>[] = []
  for (const pc of peers) {
    const sender = pc.getSenders().find((item) => item.track?.kind === 'video')
    if (sender) replacements.push(sender.replaceTrack(track))
  }
  await Promise.all(replacements)
}
