import { fireEvent, render, screen } from '@testing-library/react'
import { OverrideGateActionDialog } from './override-gate-action-dialog'

function renderDialog(
  overrides: Partial<{
    open: boolean
    onOpenChange: (open: boolean) => void
    plate: string
    currentAction: 'CHECKOUT' | 'CHECKIN' | 'MANUAL_REVIEW'
    onConfirm: (action: 'CHECKOUT' | 'CHECKIN' | 'MANUAL_REVIEW', reason: string) => void
  }> = {},
) {
  const onOpenChange = jest.fn()
  const onConfirm = jest.fn()
  const baseProps = {
    open: true,
    onOpenChange,
    onConfirm,
    plate: '43A-272.08',
    currentAction: 'CHECKOUT' as const,
    ...overrides,
  }
  const view = render(<OverrideGateActionDialog {...baseProps} />)
  return {
    onOpenChange,
    onConfirm,
    rerender: (next: Partial<typeof baseProps> = {}) =>
      view.rerender(<OverrideGateActionDialog {...baseProps} {...next} />),
  }
}

describe('OverrideGateActionDialog', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn() as never
  })

  it('opens showing the plate and the recommended action', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('43A-272.08')).toBeTruthy()
    expect(screen.getByText('Check out')).toBeTruthy()
  })

  it('defaults to check-in when the recommendation is check-out', () => {
    renderDialog({ currentAction: 'CHECKOUT' })
    expect(screen.getByRole('combobox').textContent).toContain('Check in')
  })

  it('defaults to check-out when the recommendation is check-in', () => {
    renderDialog({ currentAction: 'CHECKIN' })
    expect(screen.getByRole('combobox').textContent).toContain('Check out')
  })

  it('defaults to check-out when the recommendation is manual review', () => {
    renderDialog({ currentAction: 'MANUAL_REVIEW' })
    expect(screen.getByRole('combobox').textContent).toContain('Check out')
  })

  it('keeps Confirm disabled until a non-empty reason is entered', () => {
    renderDialog()
    const confirm = screen.getByRole('button', { name: 'Confirm Override' })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '   ' } })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Driver reported payment error' } })
    expect(confirm).toHaveProperty('disabled', false)
  })

  it('calls onConfirm with the chosen action and reason', () => {
    const { onConfirm } = renderDialog()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Driver reported payment error' } })
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Manual review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Override' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('MANUAL_REVIEW', 'Driver reported payment error')
  })

  it('resets the action and reason when reopened for a new scan', () => {
    const { rerender } = renderDialog()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Driver reported payment error' } })
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Manual review' }))
    expect(screen.getByRole('combobox').textContent).toContain('Manual review')

    rerender({ open: false })
    rerender({ open: true })

    expect(screen.getByRole('combobox').textContent).toContain('Check in')
    expect(screen.getByLabelText('Reason')).toHaveProperty('value', '')
  })

  it('calls onOpenChange with false when Cancel is clicked', () => {
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
