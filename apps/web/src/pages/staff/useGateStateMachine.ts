import { useReducer } from 'react'
import type { GateVerifyResponse, GateRecommendedAction, CheckoutWorkflowResponse } from '../../lib/sessions-api'

export type GatePhase = 
  | 'IDLE'
  | 'SCANNING'
  | 'VERIFYING'
  | 'RESULT_DISPLAYED'
  | 'CHECKOUT_PREVIEW_LOADING'
  | 'CHECKOUT_PREVIEW'
  | 'MANUAL_ENTRY'
  | 'SUBMITTING_CONFIRM'
  | 'ERROR'

export interface GateState {
  phase: GatePhase
  verificationResult: GateVerifyResponse | null
  ocrEvidenceId: string | null
  manualPlate: string
  error: string | null
  overrideAction: GateRecommendedAction | null
  overrideReason: string
  previewData: CheckoutWorkflowResponse | null
  checkoutSnapshotUrl: string | null
}

type GateAction =
  | { type: 'START_SCAN' }
  | { type: 'START_VERIFY'; evidenceId?: string }
  | { type: 'SET_RESULT'; result: GateVerifyResponse }
  | { type: 'SET_MANUAL_ENTRY'; evidenceId?: string }
  | { type: 'SET_MANUAL_PLATE'; plate: string }
  | { type: 'SUBMIT_CONFIRM'; action?: GateRecommendedAction; reason?: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'START_CHECKOUT_PREVIEW'; snapshotUrl: string }
  | { type: 'SET_CHECKOUT_PREVIEW'; data: CheckoutWorkflowResponse }
  | { type: 'RESET' }

function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case 'START_SCAN':
      return { ...state, phase: 'SCANNING', error: null, verificationResult: null }
    case 'START_VERIFY':
      return { 
        ...state, 
        phase: 'VERIFYING', 
        error: null, 
        ocrEvidenceId: action.evidenceId ?? state.ocrEvidenceId 
      }
    case 'SET_RESULT':
      return {
        ...state,
        phase: 'RESULT_DISPLAYED',
        verificationResult: action.result,
        ocrEvidenceId: action.result.ocrEvidenceId ?? state.ocrEvidenceId,
        error: null,
      }
    case 'SET_MANUAL_ENTRY':
      return { 
        ...state, 
        phase: 'MANUAL_ENTRY', 
        error: null, 
        ocrEvidenceId: action.evidenceId ?? state.ocrEvidenceId 
      }
    case 'SET_MANUAL_PLATE':
      return { ...state, manualPlate: action.plate }
    case 'SUBMIT_CONFIRM':
      return { 
        ...state, 
        phase: 'SUBMITTING_CONFIRM', 
        overrideAction: action.action ?? null,
        overrideReason: action.reason ?? ''
      }
    case 'SET_ERROR':
      return { ...state, phase: 'ERROR', error: action.error }
    case 'START_CHECKOUT_PREVIEW':
      return { ...state, phase: 'CHECKOUT_PREVIEW_LOADING', checkoutSnapshotUrl: action.snapshotUrl, error: null }
    case 'SET_CHECKOUT_PREVIEW':
      return { ...state, phase: 'CHECKOUT_PREVIEW', previewData: action.data, error: null }
    case 'RESET':
      return { 
        phase: 'IDLE', 
        verificationResult: null, 
        ocrEvidenceId: null, 
        manualPlate: '', 
        error: null, 
        overrideAction: null, 
        overrideReason: '',
        previewData: null,
        checkoutSnapshotUrl: null
      }
    default:
      return state
  }
}

export function useGateStateMachine() {
  const [state, dispatch] = useReducer(gateReducer, {
    phase: 'IDLE',
    verificationResult: null,
    ocrEvidenceId: null,
    manualPlate: '',
    error: null,
    overrideAction: null,
    overrideReason: '',
    previewData: null,
    checkoutSnapshotUrl: null,
  })

  return { state, dispatch }
}
