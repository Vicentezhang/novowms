import { useEffect, useRef } from 'react';
import bwipjs from 'bwip-js';

interface BarcodeLabelProps {
  sku: string;
  name?: string;
  width?: number; // CSS width for preview, printing handles its own size
  scale?: number;
}

export default function BarcodeLabel({ sku, name, width = 300, scale = 3 }: BarcodeLabelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !sku) return;

    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid:        'code128',       // Barcode type
        text:        sku,             // Text to encode
        scale:       scale,           // 3x scaling factor
        height:      10,              // Bar height, in millimeters
        includetext: true,            // Show human-readable text
        textxalign:  'center',        // Always good to set this
        barcolor:    '000000',        // Black bars
        backgroundcolor: 'FFFFFF',    // White background
        paddingwidth: 10,             // Quiet zone width
        paddingheight: 5,             // Quiet zone height
      });
    } catch (e) {
      console.error(e);
    }
  }, [sku, scale]);

  return (
    <div className="flex flex-col items-center bg-white p-4 border rounded-lg print:border-0 print:p-0 print:block break-inside-avoid">
        {name && <div className="text-sm font-bold mb-1 text-center max-w-[200px] truncate">{name}</div>}
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: width }} />
        {/* Fallback text if canvas fails or for extra clarity */}
        <div className="text-xs text-gray-500 mt-1">{sku}</div>
    </div>
  );
}
