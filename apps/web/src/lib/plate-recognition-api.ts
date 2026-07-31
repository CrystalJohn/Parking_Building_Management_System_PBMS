import api from './api'

export interface PlateScanCandidate {
  plate: string
  score: number
}

export interface PlateScanResult {
  /** Formatted plate for display/storage, e.g. "12B1-16888". Null if nothing found. */
  plate: string | null
  /** Raw plate text as returned by the engine, e.g. "12b116888". */
  rawPlate: string | null
  /** Canonical plate (uppercase, no separators), e.g. "30A12345". */
  canonicalPlate: string | null
  /** Display plate per VN standard, e.g. "30A-123.45". */
  displayPlate: string | null
  /** OCR confidence of the top result (0..1). */
  score: number
  /** Detection confidence of the top result (0..1). */
  dscore: number
  /** Detected plate region code, e.g. "vn". */
  region: string | null
  /** Alternative readings, best first. */
  candidates: PlateScanCandidate[]
  /** Vehicle type when available (Sedan, Motorcycle, ...). */
  vehicleType: string | null
  /** Engine processing time in ms. */
  processingTime: number
}

/**
 * Send a captured camera frame to the backend, which proxies it to the
 * Plate Recognizer Snapshot Cloud API and returns the best plate reading.
 */
export async function scanPlate(image: Blob): Promise<PlateScanResult> {
  const form = new FormData()
  form.append('image', image, 'plate.jpg')

  const { data } = await api.post<PlateScanResult>(
    '/plate-recognition/scan',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 20_000,
    },
  )
  return data
}
