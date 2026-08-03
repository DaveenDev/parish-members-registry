import React from 'react';

export function Field({ label, required, error, children }) {
  return (
    <div>
      {label && (
        <label className="block font-semibold text-[12.5px] text-parish-ink mb-1.5 tracking-wide">
          {label} {required && <span className="text-parish-gold">*</span>}
        </label>
      )}
      {children}
      {error && <div className="text-parish-error text-[12px] font-medium mt-1">{error}</div>}
    </div>
  );
}

const inputBase =
  'w-full px-3.5 py-3 text-[16px] text-parish-ink bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15';

export function TextInput(props) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />;
}

export function Select(props) {
  return <select {...props} className={`${inputBase} cursor-pointer ${props.className || ''}`} />;
}

export function Checkbox(props) {
  return <input type="checkbox" {...props} className={`w-[19px] h-[19px] accent-parish-blue cursor-pointer ${props.className || ''}`} />;
}

export function Card({ className = '', children }) {
  return <div className={`bg-white border border-parish-border rounded-[20px] shadow-card ${className}`}>{children}</div>;
}

export function PrimaryButton({ className = '', children, ...rest }) {
  return (
    <button
      {...rest}
      className={`appearance-none border-none cursor-pointer font-bold text-white bg-parish-blue rounded-xl shadow-btn transition hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function GoldButton({ className = '', children, ...rest }) {
  return (
    <button
      {...rest}
      className={`appearance-none border-none cursor-pointer font-bold text-white bg-parish-gold rounded-xl shadow-[0_10px_22px_-10px_rgba(195,155,78,.6)] transition hover:-translate-y-px ${className}`}
    >
      {children}
    </button>
  );
}

export const GhostButton = React.forwardRef(function GhostButton({ className = '', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={`appearance-none cursor-pointer font-semibold text-parish-text2 bg-transparent border-[1.5px] border-[#dcd0b7] rounded-xl transition hover:bg-[#efe7d6] ${className}`}
    >
      {children}
    </button>
  );
});

export function Spinner({ className = '' }) {
  return <span className={`inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spinSlow ${className}`} />;
}

export function StatusPill({ status }) {
  const verified = status === 'Verified';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
        verified ? 'bg-[#eaf4ee] text-[#2f7a52]' : 'bg-[#fdf1de] text-[#a1762b]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${verified ? 'bg-[#2f7a52]' : 'bg-[#a1762b]'}`} />
      {status}
    </span>
  );
}
