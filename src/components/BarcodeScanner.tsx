import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { X, Camera, Zap, ZapOff, AlertTriangle } from 'lucide-react';

// --- Types & Constants ---

interface Props {
  onScan: (text: string) => void;
  onClose: () => void;
  debug?: boolean; // Added debug prop
  validationRegex?: RegExp; // Optional regex for validation
}

const DEBUG_MODE = true; // Can be controlled via prop or env

// Error Codes
const ERR_CAMERA_UNAVAILABLE = 'CAMERA_UNAVAILABLE';
const ERR_PERMISSION_DENIED = 'PERMISSION_DENIED';
const ERR_HARDWARE_FAILURE = 'HARDWARE_FAILURE';

// Stability Configuration
const STABILITY_THRESHOLD = 3; // Number of consecutive identical scans required
const STABILITY_WINDOW_MS = 500; // Time window to reset count

  // Brightness Detection removed

// Flashlight State Management
const FLASHLIGHT_STORAGE_KEY = 'flashlight_state';

interface FlashlightState {
  flashlightStatus: boolean;
  lastUpdated: number;
}

const flashlightManager = {
  isSupported: () => {
    try {
      const key = '__test_storage__';
      localStorage.setItem(key, key);
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  },

  save: (status: boolean) => {
    if (!flashlightManager.isSupported()) return;
    try {
      const data: FlashlightState = {
        flashlightStatus: status,
        lastUpdated: Date.now()
      };
      localStorage.setItem(FLASHLIGHT_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[FlashlightManager] Save failed (storage full?)', e);
    }
  },

  load: (): boolean => {
    if (!flashlightManager.isSupported()) return false;
    try {
      const item = localStorage.getItem(FLASHLIGHT_STORAGE_KEY);
      if (!item) return false;
      const data = JSON.parse(item) as FlashlightState;
      return !!data.flashlightStatus;
    } catch (e) {
      return false;
    }
  }
};

export default function BarcodeScanner({ onScan, onClose, debug = DEBUG_MODE, validationRegex }: Props) {
  const [error, setError] = useState<{ code: string, message: string } | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMountedRef = useRef(true);
  
  // Stability Ref
  const scanStabilityRef = useRef({
      lastText: '',
      count: 0,
      lastTime: 0
  });

  // Configuration: Optimized for common Warehouse formats
  const formatsToSupport = [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
  ];

  const log = useCallback((...args: any[]) => {
    if (debug) console.log('[BarcodeScanner]', ...args);
  }, [debug]);

  // Handle flashlight state synchronization across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === FLASHLIGHT_STORAGE_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue) as FlashlightState;
          if (data.flashlightStatus !== torchOn) {
            setTorchOn(data.flashlightStatus);
            applyTorchState(data.flashlightStatus);
          }
        } catch (err) {
            log('Storage sync error', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [torchOn, log]);

  useEffect(() => {
    isMountedRef.current = true;
    const scannerId = "reader";
    let scannerInstance: Html5Qrcode | null = null;

    const initAndStart = async () => {
        try {
            // 1. Environment Check
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Browser API not supported or Insecure Context (HTTPS required)");
            }

            if (debug) {
                const devices = await Html5Qrcode.getCameras();
                log('Available Devices:', devices);
                if (devices && devices.length === 0) {
                     throw new Error("No camera devices found");
                }
            }

            scannerInstance = new Html5Qrcode(scannerId, { 
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                verbose: debug
            });
            scannerRef.current = scannerInstance;
            
            await startCamera(scannerInstance);
        } catch (e: any) {
            console.error("[BarcodeScanner] Init failed", e);
            if (isMountedRef.current) {
                handleError(e);
            }
        }
    };

    const timer = setTimeout(initAndStart, 100);

    return () => {
        isMountedRef.current = false;
        clearTimeout(timer);
        if (scannerInstance) {
            scannerInstance.stop().then(() => {
                scannerInstance?.clear();
            }).catch((err: any) => {
                console.warn("[BarcodeScanner] Cleanup warning", err);
            });
        }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Brightness check removed

  const handleError = (err: any) => {
    let code = ERR_HARDWARE_FAILURE;
    let msg = "无法启动摄像头。";
    let recovery = "请尝试刷新页面或重启设备。";

    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        code = ERR_PERMISSION_DENIED;
        msg = "请允许访问摄像头权限以使用扫码功能。";
        recovery = "请在浏览器设置中允许访问摄像头。";
    } else if (err?.name === 'NotFoundError' || err?.message?.includes('Back Camera')) {
        code = ERR_CAMERA_UNAVAILABLE;
        msg = "未检测到后置摄像头。";
        recovery = "请使用带有后置摄像头的移动设备。";
    } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        code = ERR_HARDWARE_FAILURE;
        msg = "摄像头正被占用或硬件故障。";
        recovery = "请关闭其他占用摄像头的应用。";
    } else if (err?.name === 'OverconstrainedError') {
        code = ERR_CAMERA_UNAVAILABLE;
        msg = "设备不支持所需的摄像头配置。";
        recovery = "您的设备可能不支持强制后置模式。";
    }

    log(`Error: ${code} - ${msg}`, err);
    setError({ code, message: `${msg} ${recovery}` });
  };

  const handleScanSuccess = useCallback((decodedText: string) => {
      if (!isMountedRef.current) return;
      const now = Date.now();
      const state = scanStabilityRef.current;

      if (validationRegex && !validationRegex.test(decodedText)) {
          log(`Validation failed for: ${decodedText}`);
          return;
      }

      // Optimization: For FNSKU (starts with X) or UPS (starts with 1Z), we can trust it more readily
      const isFNSKU = /^X[A-Z0-9]{9}$/.test(decodedText);
      const isUPS = /^1Z[A-Z0-9]{16}$/.test(decodedText);
      const requiredThreshold = (isFNSKU || isUPS) ? 1 : STABILITY_THRESHOLD;

      if (decodedText === state.lastText && (now - state.lastTime < STABILITY_WINDOW_MS)) {
          state.count++;
          log(`Stability Check: ${state.count}/${requiredThreshold} for ${decodedText}`);
      } else {
          state.lastText = decodedText;
          state.count = 1;
          log(`New Scan Detected: ${decodedText}`);
      }
      state.lastTime = now;

      if (state.count >= requiredThreshold) {
          log(`Scan Confirmed: ${decodedText}`);
          onScan(decodedText);
          onClose();
      }
  }, [onScan, onClose, log, validationRegex]);

  const startCamera = async (scanner: Html5Qrcode) => {
      if (!isMountedRef.current) return;
      setError(null);
      
      const config = { 
          fps: 30, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              // Optimization: Wider scan area for linear barcodes (like FNSKU, UPS)
              return {
                  width: Math.floor(viewfinderWidth * 0.9), // Increased to 90% width
                  height: Math.floor(viewfinderHeight * 0.4) // Reduced height to focus on linear
              };
          },
          // aspectRatio: 1.0, // Removed to allow full screen aspect ratio
          formatsToSupport,
          videoConstraints: {
              width: { ideal: 1920 }, // Full HD for better details
              height: { ideal: 1080 },
              facingMode: { exact: "environment" },
              focusMode: "continuous"
          }
      };
      
      try {
          if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
              await scanner.stop();
          }

          log(`Starting camera with config:`, config.videoConstraints);

          await scanner.start(
              { facingMode: { exact: "environment" } }, 
              config,
              handleScanSuccess,
              () => {}
          );

          if (isMountedRef.current) {
              checkCapabilities(scanner);
          }

      } catch (err: any) {
          if (!isMountedRef.current) return;
          console.error(`[BarcodeScanner] Start failed`, err);
          handleError(err);
      }
  };

  const checkCapabilities = (scanner: Html5Qrcode) => {
      try {
          // @ts-ignore
          const capabilities = scanner.getRunningTrackCameraCapabilities();
          log("Camera Capabilities:", capabilities);
          
          // iOS Safari compatibility: torch might not be reported in capabilities
          // Optimistically enable if we are on a mobile device (likely back camera due to config)
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          if ((capabilities && 'torch' in capabilities) || isIOS) {
              setHasTorch(true);
              const savedState = flashlightManager.load();
              if (savedState) {
                  setTorchOn(true);
                  applyTorchState(true, scanner);
              }
          }
      } catch (e) {
          log("Failed to get capabilities", e);
      }
  };

  const applyTorchState = (state: boolean, scannerInstance = scannerRef.current) => {
      if (!scannerInstance) return;
      scannerInstance.applyVideoConstraints({
          advanced: [{ torch: state } as any]
      }).catch((err: any) => log("Apply torch failed", err));
  };

  const toggleTorch = () => {
      if (!scannerRef.current) return;
      
      const nextState = !torchOn;
      
      scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: nextState } as any]
      })
      .then(() => {
          setTorchOn(nextState);
          flashlightManager.save(nextState);
          log(`Torch toggled to ${nextState}`);
      })
      .catch((err: any) => {
          console.error("[BarcodeScanner] Toggle torch failed", err);
      });
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col md:items-center md:justify-center md:bg-black/90 md:p-4">
      <div className="flex-1 w-full bg-black relative flex flex-col md:max-w-lg md:h-[80vh] md:rounded-2xl md:border md:border-gray-800 md:overflow-hidden">
        
        {/* Header Overlay */}
        <div className="absolute top-0 left-0 right-0 h-[60px] z-10 flex items-center justify-between px-3 bg-gradient-to-b from-black/80 to-transparent">
            <h3 className="font-bold text-white flex items-center gap-2">
                <Camera size={20}/> 扫码识别
            </h3>
            
            {/* Controls Area */}
            <div className="flex items-center gap-3 h-full">
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    aria-label="关闭扫描"
                    className="w-[44px] h-[44px] flex items-center justify-center bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
                >
                    <X size={20}/>
                </button>
            </div>
        </div>

        {/* Camera View */}
        <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden">
            <div id="reader" className="w-full h-full object-cover"></div>
            
            {/* Error Overlay */}
            {error && (
                <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-red-600/90 text-white p-6 rounded-xl text-center shadow-2xl backdrop-blur-sm z-20">
                    <AlertTriangle size={48} className="mx-auto mb-4 opacity-80"/>
                    <p className="font-bold text-lg mb-2">启动失败 ({error.code})</p>
                    <p className="text-sm opacity-90 break-words">{error.message}</p>
                    <button 
                        onClick={() => { 
                            setError(null); 
                            if(scannerRef.current) startCamera(scannerRef.current); 
                        }} 
                        className="mt-4 px-6 py-2 bg-white text-red-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
                    >
                        重试
                    </button>
                </div>
            )}
        </div>

        {/* Flashlight Button (Centered Below Scan Box) */}
        {hasTorch && (
            <div 
                className="absolute left-1/2 z-50 pointer-events-auto flex flex-col items-center justify-center"
                style={{ 
                    top: 'calc(50% + 25vw + 20px)', 
                    transform: 'translate(-50%, 0)'
                }}
            >
                <button
                    onClick={toggleTorch}
                    disabled={!hasTorch}
                    aria-label={torchOn ? "关闭手电筒" : "打开手电筒"}
                    className={`
                        w-[48px] h-[48px] flex items-center justify-center rounded-full
                        bg-black/50 backdrop-blur-sm text-white border border-white/10
                        transition-all duration-200 ease-in-out
                        active:scale-95 active:bg-black/70
                        disabled:opacity-30
                        shadow-lg
                    `}
                >
                    <div className="flex items-center justify-center">
                         {/* Material Design Style Lightning Icon */}
                        {torchOn ? <Zap size={24} fill="white" className="text-white"/> : <ZapOff size={24} className="text-white"/>}
                    </div>
                </button>
            </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10">
            <p className="text-white/80 text-sm font-medium">将条码置于框内，支持 Code128 / EAN / DataMatrix</p>
            {debug && <p className="text-xs text-white/40 mt-1">Debug Mode On</p>}
        </div>
      </div>
    </div>
  );
}
