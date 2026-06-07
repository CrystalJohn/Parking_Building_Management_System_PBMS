import type { QrCodeResponse } from '../types/api';

// Expected backend shape is { qrCode: "data:image/png;base64,..." }.
// Other keys are accepted while the backend QR contract is being stabilized.
export function normalizeQrCodeDataUrl(response?: QrCodeResponse | null) {
  if (!response) {
    return null;
  }

  return (
    response.qrCode ??
    response.dataUrl ??
    response.qrDataUrl ??
    response.qrCodeDataUrl ??
    response.image ??
    response.value ??
    null
  );
}
