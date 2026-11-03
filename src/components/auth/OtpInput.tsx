import React, { useRef, useEffect } from 'react';

interface OtpInputProps {
  digits: string[];
  onChange: (digits: string[]) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  digits,
  onChange,
  disabled = false,
  autoFocus = true,
  hasError = false
}) => {
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  useEffect(() => {
    if (autoFocus && inputRefs[0]?.current) {
      inputRefs[0].current.focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      onChange(next);
      return;
    }

    const char = clean.slice(-1);
    const next = [...digits];
    next[index] = char;
    onChange(next);

    // Auto advance to next box
    if (index < 5 && inputRefs[index + 1]?.current) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        onChange(next);
        inputRefs[index - 1]?.current?.focus();
      } else {
        const next = [...digits];
        next[index] = '';
        onChange(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1]?.current?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs[index + 1]?.current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const next = ['', '', '', '', '', ''];
      const chars = pasted.split('');
      chars.forEach((c, idx) => {
        if (idx < 6) next[idx] = c;
      });
      onChange(next);

      // Focus the next empty input or the last input
      const targetFocus = Math.min(chars.length, 5);
      inputRefs[targetFocus]?.current?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={inputRefs[index]}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-mono font-bold rounded-xl transition-all outline-none ${
            hasError
              ? 'bg-rose-950/20 border-rose-500/80 text-rose-200 focus:ring-2 focus:ring-rose-500/30'
              : digit
              ? 'bg-slate-900 border-blue-500 text-cyan-300 shadow-sm shadow-blue-500/20'
              : 'bg-slate-900/90 border-slate-700/80 text-white hover:border-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
          } border`}
          aria-label={`Digit ${index + 1} of verification code`}
        />
      ))}
    </div>
  );
};
