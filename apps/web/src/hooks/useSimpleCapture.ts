import { useCallback, useEffect, useRef, useState } from 'react'

export interface SimpleCaptureResult {
  blob: Blob
  dataUrl: string
}

export function useSimpleCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsStreaming(false)
    setIsLoading(false)
  }, [])

  const startCamera = useCallback(async () => {
    stopCamera()
    setIsLoading(true)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)

        // Wait until video has loaded dimensions
        if (videoRef.current.readyState < 2) {
          await new Promise<void>((resolve) => {
            if (!videoRef.current) return resolve()
            videoRef.current.onloadeddata = () => resolve()
          })
        }
      }

      setIsStreaming(true)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể truy cập camera. Vui lòng cấp quyền camera.'
      setError(msg)
      stopCamera()
    } finally {
      setIsLoading(false)
    }
  }, [stopCamera])

  const captureFrame = useCallback(async (): Promise<SimpleCaptureResult | null> => {
    const video = videoRef.current
    if (!video || !isStreaming || video.readyState < 2) {
      setError('Camera chưa sẵn sàng.')
      return null
    }

    try {
      const width = video.videoWidth || 1280
      const height = video.videoHeight || 720

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Không thể khởi tạo canvas 2D context')

      ctx.drawImage(video, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
      })

      if (!blob) throw new Error('Không thể tạo file ảnh từ camera')

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

      return { blob, dataUrl }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi chụp ảnh.'
      setError(msg)
      return null
    }
  }, [isStreaming])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return {
    videoRef,
    isStreaming,
    isLoading,
    error,
    startCamera,
    stopCamera,
    captureFrame,
  }
}
