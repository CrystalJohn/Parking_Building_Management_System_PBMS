import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:3000/api';
const TEST_IMAGE = path.join(process.cwd(), '..', 'web', 'public', 'car-with-plate.jpg');

// Track DB queries via API response timing
const timings = {

async function main() {
  // Step 1: Login để lấy token
  const loginStart = performance.now();
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0900000003', password: '123456' }),
  });
  const loginEnd = performance.now();
  const loginData = await loginRes.json();

  if (!loginRes.ok || !loginData.access_token) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }

  console.log(`[LOGIN] ${loginRes.ok ? 'OK' : 'FAIL'} - ${(loginEnd - loginStart).toFixed(0)}ms`);
  const token = loginData.access_token;

  // Step 2: Scan plate
  const imageBuffer = fs.readFileSync(TEST_IMAGE);
  const formData = new FormData();
  formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'car.jpg');

  console.log(`\n[SCAN] Image size: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  // Measure FE-level timing (request start → response fully received)
  const feScanStart = performance.now();
  const scanStart = performance.now();
  const scanRes = await fetch(`${API_URL}/gate/scan-plate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const scanEnd = performance.now();
  const feScanEnd = performance.now();
  const scanData = await scanRes.json();

  console.log(`[SCAN] HTTP Status: ${scanRes.status} - Backend total: ${(scanEnd - scanStart).toFixed(0)}ms - FE round-trip: ${(feScanEnd - feScanStart).toFixed(0)}ms`);
  console.log(`[SCAN] Mode: ${scanData.mode} - Plate: ${scanData.plateConfirmed || scanData.error}`);
  console.log(`[SCAN] OCR evidence ID: ${scanData.ocrEvidenceId}`);
  if (scanData.durationMs) {
    console.log(`[SCAN] OCR durationMs (from API): ${scanData.durationMs}ms`);
  }

  // Step 4: Resolve plate (manual) for comparison
  if (scanData.mode === 'NEEDS_MANUAL_PLATE') {
    console.log('\n[RESOLVE] Testing manual resolve...');
    const resolveStart = performance.now();
    const resolveRes = await fetch(`${API_URL}/gate/resolve-plate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        plate: '59A12345',
        ocrEvidenceId: scanData.ocrEvidenceId,
      }),
    });
    const resolveEnd = performance.now();
    const resolveData = await resolveRes.json();
    console.log(`[RESOLVE] Status: ${resolveRes.status} - ${(resolveEnd - resolveStart).toFixed(0)}ms`);
    console.log(`[RESOLVE] Response mode: ${resolveData.mode}`);
  }
}

main().catch(console.error);
