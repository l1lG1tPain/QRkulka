/* ══════════════════════════════════════
   SCANNER.JS — QR + Barcode scanner
   Использует html5-qrcode library
══════════════════════════════════════ */

'use strict';

const Scanner = (() => {

  let _instance   = null;
  let _running    = false;
  let _torchOn    = false;

  const CONFIG = {
    fps: 15,
    qrbox: { width: 220, height: 220 },
    aspectRatio: 1.0,
    supportedScanTypes: [
      Html5QrcodeScanType.SCAN_TYPE_CAMERA,
    ],
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.AZTEC,
    ],
  };

  /**
   * Start camera scanner
   * @param {string}   elementId  - DOM id of the container div
   * @param {Function} onSuccess  - called with (decodedText, format)
   * @param {Function} onError    - optional, called on persistent errors
   */
  async function start(elementId, onSuccess, onError) {
      if (_running) await stop();

      _instance = new Html5Qrcode(elementId, { verbose: false });

      try {
          // Запрос разрешения на камеру
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          stream.getTracks().forEach(track => track.stop());

          // Теперь запустим сканер
          await _instance.start(
              { facingMode: { ideal: 'environment' } },
              CONFIG,
              (text, result) => {
                  const fmt = result?.result?.format?.formatName || 'QR_CODE';
                  onSuccess(text, fmt);
              },
              () => {}
          );
          _running = true;
      } catch (err) {
          if (onError) onError(err.message || 'Доступ к камере запрещен');
          throw err;
      }
  }

  /**
   * Stop camera scanner
   */
  async function stop() {
    if (_instance && _running) {
      try {
        await _instance.stop();
        _instance.clear();
      } catch { /* already stopped */ }
    }
    _running  = false;
    _torchOn  = false;
    _instance = null;
  }

  /**
   * Toggle torch (flash)
   */
  async function toggleTorch() {
    if (!_instance || !_running) return false;
    try {
      const capabilities = _instance.getRunningTrackCapabilities();
      if (!capabilities.torch) return false;
      _torchOn = !_torchOn;
      await _instance.applyVideoConstraints({ advanced: [{ torch: _torchOn }] });
      return _torchOn;
    } catch {
      return false;
    }
  }

  /**
   * Decode QR/barcode from an image File/Blob
   * @param {File}     file
   * @param {Function} onSuccess (text, format)
   * @param {Function} onError   (message)
   */
  async function scanFile(file, onSuccess, onError) {
    try {
      // Use a temporary offscreen instance
      const tempId = '__scanner_temp__';
      let tempEl = document.getElementById(tempId);
      if (!tempEl) {
        tempEl = document.createElement('div');
        tempEl.id = tempId;
        tempEl.style.display = 'none';
        document.body.appendChild(tempEl);
      }

      const tempScanner = new Html5Qrcode(tempId, { verbose: false });
      const result = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      onSuccess(result, 'FILE');
    } catch (err) {
      onError(err?.message || 'Код не распознан');
    }
  }

  /**
   * Detect format from a decoded value (heuristic)
   * Returns 'QR' | 'Штрихкод' | 'Ваучер'
   */
  function guessType(value, formatName) {
    const fmt = (formatName || '').toUpperCase();
    if (fmt === 'QR_CODE')  return 'QR';
    if (fmt.includes('EAN') || fmt.includes('UPC') ||
        fmt.includes('CODE') || fmt.includes('ITF')) return 'Штрихкод';
    if (fmt === 'PDF_417' || fmt === 'AZTEC')        return 'Ваучер';
    // Heuristic on value
    if (/^https?:\/\//.test(value)) return 'QR';
    if (/^\d{8,14}$/.test(value))   return 'Штрихкод';
    return 'QR';
  }

  return { start, stop, toggleTorch, scanFile, guessType };

})();
