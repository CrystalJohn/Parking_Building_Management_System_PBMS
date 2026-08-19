import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CapturedThumbnail } from './CapturedThumbnail'

describe('CapturedThumbnail', () => {
  it('hiển thị trạng thái "Chưa chụp" khi chưa có ảnh', () => {
    render(<CapturedThumbnail label="Ảnh biển số (OCR)" />)

    expect(screen.getByText('Ảnh biển số (OCR)')).toBeInTheDocument()
    expect(screen.getByText('Chưa chụp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chụp ảnh/i })).toBeInTheDocument()
  })

  it('gọi onCapture khi click "Chụp ảnh"', async () => {
    const onCapture = jest.fn()
    render(<CapturedThumbnail label="Ảnh biển số (OCR)" onCapture={onCapture} />)

    await userEvent.click(screen.getByRole('button', { name: /Chụp ảnh/i }))
    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('hiển thị trạng thái "Đã chụp" và nút "Chụp lại" khi có ảnh', () => {
    render(
      <CapturedThumbnail
        label="Ảnh biển số (OCR)"
        imageUrl="blob:http://localhost/dummy-plate.jpg"
        plateNumber="30A-123.45"
      />,
    )

    expect(screen.getByText('Đã chụp')).toBeInTheDocument()
    expect(screen.getByText('30A-123.45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chụp lại/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ảnh biển số (OCR)' })).toHaveAttribute(
      'src',
      'blob:http://localhost/dummy-plate.jpg',
    )
  })

  it('gọi onRetake khi click "Chụp lại"', async () => {
    const onRetake = jest.fn()
    render(
      <CapturedThumbnail
        label="Ảnh toàn cảnh xe"
        imageUrl="blob:http://localhost/dummy-overview.jpg"
        onRetake={onRetake}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Chụp lại/i }))
    expect(onRetake).toHaveBeenCalledTimes(1)
  })
})
