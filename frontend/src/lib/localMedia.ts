export type LocalMediaResult = {
  stream: MediaStream
  hasVideo: boolean
  hasAudio: boolean
  warning: string
}

type PermissionStateValue = PermissionState | 'unknown'

let activeStream: MediaStream | null = null
let inFlight: Promise<LocalMediaResult> | null = null
let lastWarning = ''

const liveTracks = (stream: MediaStream | null, kind?: 'audio' | 'video') =>
  (stream?.getTracks() || []).filter((track) => (
    track.readyState === 'live' && (!kind || track.kind === kind)
  ))

export const getLiveLocalStream = () => (
  liveTracks(activeStream).length > 0 ? activeStream : null
)

const queryPermission = async (name: 'camera' | 'microphone'): Promise<PermissionStateValue> => {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

const errorName = (err: unknown) => (
  err instanceof DOMException || err instanceof Error ? err.name : ''
)

const blockedSettingsMessage = (cameraState: PermissionStateValue, micState: PermissionStateValue, device: 'camera' | 'microphone' | 'media') => {
  const cameraBlocked = cameraState === 'denied'
  const micBlocked = micState === 'denied'
  const target = device === 'camera' || (cameraBlocked && !micBlocked)
    ? 'camera'
    : device === 'microphone' || (micBlocked && !cameraBlocked)
      ? 'microphone'
      : 'camera and microphone'
  return `Chrome has blocked ${target} access for this site. Click the padlock or camera icon in the address bar → Site settings → set Camera and Microphone to Allow, then click Try again. The browser will not show a permission popup until that setting is changed.`
}

export const describeMediaError = async (err: unknown, device: 'camera' | 'microphone' | 'media' = 'media') => {
  if (!window.isSecureContext) {
    return 'Camera and microphone access requires localhost or HTTPS. Open the app at http://localhost:5173.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not support camera and microphone access. Use an up-to-date version of Chrome, Edge, or Firefox.'
  }

  const name = errorName(err)
  const cameraState = await queryPermission('camera')
  const micState = await queryPermission('microphone')
  const blocked = cameraState === 'denied' || micState === 'denied'
  const label = device === 'camera' ? 'camera' : device === 'microphone' ? 'microphone' : 'camera or microphone'

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (blocked) return blockedSettingsMessage(cameraState, micState, device)
    return `${device === 'media' ? 'Camera or microphone' : label.charAt(0).toUpperCase() + label.slice(1)} access was not granted. Click Try again and choose Allow when the browser asks.`
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasCamera = devices.some((item) => item.kind === 'videoinput')
      const hasMic = devices.some((item) => item.kind === 'audioinput')
      if (device === 'camera' || (!hasCamera && hasMic)) {
        return 'No camera was found. Connect a webcam or choose an available camera, then click Try again.'
      }
      if (device === 'microphone' || (!hasMic && hasCamera)) {
        return 'No microphone was found. Connect a microphone or choose an available input, then click Try again.'
      }
    } catch {
      // enumerateDevices can fail in some browsers; fall through to the generic message.
    }
    return 'No camera or microphone was found. Connect a device or select one in the browser prompt, then click Try again.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return `The ${label} is already in use by another application or browser tab. Close the other app or tab, then click Try again.`
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return `The selected ${label} does not support the requested settings. Click Try again to use the default device.`
  }

  if (name === 'SecurityError') {
    return 'The browser blocked media access because this page is not in a secure context. Use http://localhost:5173 or HTTPS.'
  }

  if (name === 'NotSupportedError' || name === 'TypeError') {
    return 'This browser cannot access media devices. Use Chrome, Edge, or Firefox at http://localhost:5173.'
  }

  if (err instanceof Error && err.message) {
    return `Unable to start the ${label}: ${err.message}`
  }
  return `Unable to start the ${label}. Click Try again, or check Chrome site settings for this page.`
}

const addTracks = (target: MediaStream, source: MediaStream) => {
  source.getTracks().forEach((track) => {
    if (!target.getTracks().some((existing) => existing.id === track.id)) {
      target.addTrack(track)
    }
  })
}

const requestStream = async (constraints: MediaStreamConstraints) => (
  navigator.mediaDevices.getUserMedia(constraints)
)

const resultFrom = (stream: MediaStream, warning: string): LocalMediaResult => {
  activeStream = stream
  lastWarning = warning
  return {
    stream,
    hasVideo: liveTracks(stream, 'video').length > 0,
    hasAudio: liveTracks(stream, 'audio').length > 0,
    warning
  }
}

const warningForPartial = async (videoErr: unknown, audioErr: unknown) => {
  if (videoErr && audioErr) return describeMediaError(videoErr)
  if (videoErr) return `${await describeMediaError(videoErr, 'camera')} Microphone is available.`
  if (audioErr) return `${await describeMediaError(audioErr, 'microphone')} Camera is available.`
  return ''
}

const fillMissingTracks = async (stream: MediaStream): Promise<LocalMediaResult> => {
  let videoErr: unknown
  let audioErr: unknown

  if (liveTracks(stream, 'video').length === 0) {
    try {
      addTracks(stream, await requestStream({ video: true, audio: false }))
    } catch (err) {
      videoErr = err
    }
  }

  if (liveTracks(stream, 'audio').length === 0) {
    try {
      addTracks(stream, await requestStream({ audio: true, video: false }))
    } catch (err) {
      audioErr = err
    }
  }

  if (liveTracks(stream).length === 0) {
    throw videoErr || audioErr || new Error('No media tracks')
  }

  return resultFrom(stream, await warningForPartial(videoErr, audioErr))
}

const acquireFreshStream = async (): Promise<LocalMediaResult> => {
  if (!window.isSecureContext) {
    throw new DOMException('Insecure context', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Media devices unavailable', 'NotSupportedError')
  }

  try {
    return resultFrom(await requestStream({ audio: true, video: true }), '')
  } catch (bothErr) {
    const stream = new MediaStream()
    let videoErr: unknown
    let audioErr: unknown

    try {
      addTracks(stream, await requestStream({ video: true, audio: false }))
    } catch (err) {
      videoErr = err
    }

    try {
      addTracks(stream, await requestStream({ audio: true, video: false }))
    } catch (err) {
      audioErr = err
    }

    if (liveTracks(stream).length === 0) {
      throw videoErr || audioErr || bothErr
    }

    return resultFrom(stream, await warningForPartial(videoErr, audioErr))
  }
}

export const acquireLocalMedia = async (options?: { retryMissing?: boolean }): Promise<LocalMediaResult> => {
  const existing = getLiveLocalStream()
  if (existing) {
    const hasVideo = liveTracks(existing, 'video').length > 0
    const hasAudio = liveTracks(existing, 'audio').length > 0
    if (hasVideo && hasAudio) {
      lastWarning = ''
      return { stream: existing, hasVideo, hasAudio, warning: '' }
    }
    if (options?.retryMissing) {
      if (inFlight) return inFlight
      inFlight = fillMissingTracks(existing).finally(() => {
        inFlight = null
      })
      return inFlight
    }
    return {
      stream: existing,
      hasVideo,
      hasAudio,
      warning: lastWarning
    }
  }

  if (inFlight) return inFlight
  inFlight = acquireFreshStream().finally(() => {
    inFlight = null
  })
  return inFlight
}

export const releaseLocalMedia = () => {
  inFlight = null
  lastWarning = ''
  activeStream?.getTracks().forEach((track) => track.stop())
  activeStream = null
}
