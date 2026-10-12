import axios from 'axios'
import { API_URL } from '../config'

export type MeetingSummary = {
  _id: string
  title: string
  meetingCode: string
  status: string
}

export type AuthUser = {
  _id: string
  name: string
  email: string
}

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
})

export const joinMeetingByCode = async (code: string) => {
  const meetingCode = code.trim().toUpperCase()
  const res = await axios.post<MeetingSummary>(
    `${API_URL}/api/meetings/code/${encodeURIComponent(meetingCode)}/join`,
    {},
    { headers: authHeader() }
  )
  return res.data
}

export const fetchProfile = async () => {
  const res = await axios.get<AuthUser>(`${API_URL}/api/auth/profile`, {
    headers: authHeader()
  })
  return res.data
}

export const meetingJoinUrl = (meetingCode: string) => {
  const url = new URL(window.location.origin)
  url.searchParams.set('join', meetingCode)
  return url.toString()
}
