import { useMutation } from '@tanstack/react-query'
import { lookupSession, type LookupResult } from '../../../lib/sessions-api'

export type { LookupResult }

export function useSessionLookup() {
  return useMutation<LookupResult, unknown, string>({
    mutationFn: async (query: string) => {
      return lookupSession(query)
    },
  })
}
