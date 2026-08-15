import { useCallback, useState } from 'react'
import { lookupSession, type LookupResult } from '../../../lib/sessions-api'

/**
 * Thin wrapper around the unified lookup API with the same shape as a
 * react-query `useMutation` ({ mutate, data, isPending, isError, ... }).
 *
 * We use a mutation (not a query) because the lookup fires on an explicit
 * scan/submit action, never auto-fetches. The project does not yet depend on
 * @tanstack/react-query, so this is a self-contained hook with an identical
 * contract — swap to useMutation later without changing call sites.
 *
 * Debouncing the manual plate input is the component's responsibility
 * (see SmartGateInput) and should happen before calling `mutate`.
 */
export interface UseSessionLookupResult {
  mutate: (query: string) => void
  data?: LookupResult
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  error?: unknown
  reset: () => void
}

export function useSessionLookup(): UseSessionLookupResult {
  const [data, setData] = useState<LookupResult | undefined>(undefined)
  const [isPending, setIsPending] = useState(false)
  const [isError, setIsError] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<unknown>(undefined)

  const reset = useCallback(() => {
    setData(undefined)
    setIsPending(false)
    setIsError(false)
    setIsSuccess(false)
    setError(undefined)
  }, [])

  const mutate = useCallback(
    (query: string) => {
      setIsPending(true)
      setIsError(false)
      setIsSuccess(false)
      setError(undefined)
      lookupSession(query)
        .then((res) => {
          setData(res)
          setIsSuccess(true)
          setIsPending(false)
        })
        .catch((err) => {
          setError(err)
          setIsError(true)
          setIsPending(false)
        })
    },
    [],
  )

  return { mutate, data, isPending, isError, isSuccess, error, reset }
}
