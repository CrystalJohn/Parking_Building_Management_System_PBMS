import api from './api'
import { getToken } from './auth'

export type OperationIssueType =
  | 'lost_ticket_review'
  | 'payment_issue'
  | 'ocr_mismatch'
  | 'reservation_exception'
  | 'slot_state_mismatch'
  | 'manual_review'

export type OperationIssueSeverity = 'critical' | 'warning' | 'info'
export type OperationIssueStatus = 'open' | 'in_review' | 'resolved' | 'dismissed'
export type OperationIssueSource = 'staff' | 'system'

export interface OperationIssue {
  id: string
  type: OperationIssueType
  severity: OperationIssueSeverity
  status: OperationIssueStatus
  source: OperationIssueSource
  note: string
  resolutionNote?: string | null
  plateNumber?: string | null
  sessionId?: string | null
  reservationId?: string | null
  paymentId?: string | null
  slotId?: number | null
  createdAt: string
  updatedAt: string
  reviewedAt?: string | null
  resolvedAt?: string | null
  createdBy?: {
    id: string
    fullName?: string | null
    phone?: string | null
  } | null
  reviewedBy?: {
    id: string
    fullName?: string | null
    phone?: string | null
  } | null
  session?: {
    id: string
    sessionCode?: string | null
    licensePlate?: string | null
    plateNumberConfirmed?: string | null
    status: string
  } | null
  reservation?: {
    id: string
    status: string
  } | null
  payment?: {
    id: string
    amount: number
    method: string
    status: string
  } | null
  slot?: {
    id: number
    code?: string | null
  } | null
}

export interface OperationIssueSummary {
  critical: number
  warning: number
  info: number
  openTotal: number
}

export interface CreateOperationIssuePayload {
  type: OperationIssueType
  severity: OperationIssueSeverity
  note: string
  sessionId?: string
  reservationId?: string
  paymentId?: string
  slotId?: number
  plateNumber?: string
}

export interface UpdateOperationIssuePayload {
  status: OperationIssueStatus
  resolutionNote?: string
}

export type OperationIssueStreamEvent =
  | { event: 'connected'; data: { ok: boolean } }
  | { event: 'issue.created' | 'issue.updated' | 'issue.resolved'; data: OperationIssue }

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export async function createOperationIssue(payload: CreateOperationIssuePayload) {
  const { data } = await api.post<OperationIssue>('/operation-issues', payload)
  return data
}

export async function getOperationIssues(status?: OperationIssueStatus) {
  const { data } = await api.get<OperationIssue[]>('/manager/operation-issues', {
    params: status ? { status } : undefined,
  })
  return data
}

export async function getOperationIssueSummary() {
  const { data } = await api.get<OperationIssueSummary>('/manager/operation-issues/summary')
  return data
}

export async function updateOperationIssue(id: string, payload: UpdateOperationIssuePayload) {
  const { data } = await api.patch<OperationIssue>(`/manager/operation-issues/${id}`, payload)
  return data
}

export function connectManagerIssueStream(
  onEvent: (event: OperationIssueStreamEvent) => void,
  onError: (error: unknown) => void,
) {
  const controller = new AbortController()

  void (async () => {
    try {
      const token = getToken()
      const response = await fetch(buildApiUrl('/manager/operation-issues/events'), {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Issue stream failed (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const parsed = parseSseChunk(chunk)
          if (parsed) onEvent(parsed)
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) onError(error)
    }
  })()

  return () => controller.abort()
}

function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return `${API_BASE_URL.replace(/\/$/, '')}${path}`
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

function parseSseChunk(chunk: string): OperationIssueStreamEvent | null {
  const eventLine = chunk.split('\n').find((line) => line.startsWith('event:'))
  const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'))
  if (!eventLine || !dataLine) return null

  const event = eventLine.replace(/^event:\s*/, '').trim() as OperationIssueStreamEvent['event']
  const rawData = dataLine.replace(/^data:\s*/, '').trim()
  if (!event || !rawData) return null

  try {
    return { event, data: JSON.parse(rawData) } as OperationIssueStreamEvent
  } catch {
    return null
  }
}
