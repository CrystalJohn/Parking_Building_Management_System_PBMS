import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { getUser } from './auth'
import {
  connectManagerIssueStream,
  getOperationIssues,
  getOperationIssueSummary,
  updateOperationIssue,
  type OperationIssue,
  type OperationIssueStatus,
  type OperationIssueSummary,
  type UpdateOperationIssuePayload,
} from './operation-issues-api'

interface ManagerOperationsContextValue {
  issues: OperationIssue[]
  summary: OperationIssueSummary
  loading: boolean
  connected: boolean
  refresh: () => Promise<void>
  updateIssue: (id: string, payload: UpdateOperationIssuePayload) => Promise<OperationIssue>
}

const EMPTY_SUMMARY: OperationIssueSummary = {
  critical: 0,
  warning: 0,
  info: 0,
  openTotal: 0,
}

const ManagerOperationsContext = createContext<ManagerOperationsContextValue | null>(null)

export function ManagerOperationsProvider({ children }: { children: ReactNode }) {
  const user = getUser()
  const enabled = user?.role === 'manager' || user?.role === 'admin'
  const [issues, setIssues] = useState<OperationIssue[]>([])
  const [summary, setSummary] = useState<OperationIssueSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(enabled)
  const [connected, setConnected] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    const [issueData, summaryData] = await Promise.all([
      getOperationIssues(),
      getOperationIssueSummary(),
    ])
    setIssues(issueData)
    setSummary(summaryData)
    setLoading(false)
  }, [enabled])

  const applyIssue = useCallback((issue: OperationIssue) => {
    setIssues((current) => {
      const next = current.filter((item) => item.id !== issue.id)
      return [issue, ...next].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    })
  }, [])

  const updateIssue = useCallback(
    async (id: string, payload: UpdateOperationIssuePayload) => {
      const updated = await updateOperationIssue(id, payload)
      applyIssue(updated)
      const summaryData = await getOperationIssueSummary()
      setSummary(summaryData)
      return updated
    },
    [applyIssue],
  )

  useEffect(() => {
    if (!enabled) {
      setIssues([])
      setSummary(EMPTY_SUMMARY)
      setLoading(false)
      return
    }

    void refresh().catch(() => {
      setLoading(false)
      toast.error('Unable to load manager operations queue')
    })
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return

    const cleanup = connectManagerIssueStream(
      (message) => {
        if (message.event === 'connected') {
          setConnected(true)
          return
        }

        applyIssue(message.data)
        void getOperationIssueSummary().then(setSummary).catch(() => undefined)

        if (message.event === 'issue.created') {
          toast.info('New manager review requested')
        }
      },
      () => {
        setConnected(false)
      },
    )

    return cleanup
  }, [applyIssue, enabled])

  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      if (!connected) void refresh().catch(() => undefined)
    }, 75_000)
    return () => window.clearInterval(interval)
  }, [connected, enabled, refresh])

  const value = useMemo<ManagerOperationsContextValue>(
    () => ({
      issues,
      summary,
      loading,
      connected,
      refresh,
      updateIssue,
    }),
    [connected, issues, loading, refresh, summary, updateIssue],
  )

  return (
    <ManagerOperationsContext.Provider value={value}>
      {children}
    </ManagerOperationsContext.Provider>
  )
}

export function useManagerOperations() {
  const context = useContext(ManagerOperationsContext)
  if (!context) {
    return {
      issues: [],
      summary: EMPTY_SUMMARY,
      loading: false,
      connected: false,
      refresh: async () => undefined,
      updateIssue: async () => {
        throw new Error('Manager operations provider is unavailable')
      },
    } satisfies ManagerOperationsContextValue
  }
  return context
}

export function isOpenIssueStatus(status: OperationIssueStatus) {
  return status === 'open' || status === 'in_review'
}
