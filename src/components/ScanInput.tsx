import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../lib/i18n';
import { Keyboard, Barcode, ScanLine } from 'lucide-react';

interface ScanInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  onScanClick?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function ScanInput({ 
  label, 
  value, 
  onChange, 
  onEnter, 
  placeholder, 
  autoFocus = true, 
  onScanClick,
  className = ""
}: ScanInputProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [showKeyboard, setShowKeyboard] = useState(true); // Default: Keyboard ON for compatibility

  useEffect(() => { 
    if(autoFocus) setTimeout(() => ref.current?.focus(), 100);
  }, [autoFocus]);

  const toggleKeyboard = () => {
    const nextState = !showKeyboard;
    setShowKeyboard(nextState);
    if (!nextState) setTimeout(() => ref.current?.focus(), 100);
  };

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex justify-between items-center mb-1">
        {label && <label className="block font-bold text-gray-700 text-sm">{label}</label>}
        <button 
          type="button"
          onClick={toggleKeyboard}
          className={`p-1 rounded flex items-center gap-1 text-xs transition-colors ${showKeyboard ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
        >
          <Keyboard size={14} /> {showKeyboard ? t('kb_on') : t('kb_off')}
        </button>
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
            <input 
              ref={ref} 
              value={value} 
              onChange={e=>onChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onEnter && onEnter()}
              className="w-full pl-10 pr-4 py-3 border-2 border-blue-500 rounded-xl text-lg outline-none focus:ring-4 ring-blue-100 transition-all font-mono font-bold"
              placeholder={placeholder}
              inputMode={showKeyboard ? "text" : "none"}
            />
            <Barcode className="absolute left-3 top-3.5 text-gray-400" size={20}/>
        </div>
        {onScanClick && (
          <button 
              type="button"
              onClick={onScanClick}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all flex items-center justify-center min-w-[3rem]"
          >
              <ScanLine size={24}/>
          </button>
        )}
      </div>
    </div>
  );
}
