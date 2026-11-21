import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* NxxR identity: deep black and navy, electric blue. */
export const NX_CSS = `
@layer base { :where(.nx .grid) { grid-template-columns: minmax(0, 1fr); } }
@layer components {
.nx { --void:#03050b; --navy:#070d1c; --deck:#0a1326; --panel:#0e1a33; --line:#1c2c4f; --ink:#e6eeff; --dim:#8495bd; --blue:#2f8cff; --cyan:#5fd4ff; --hot:#c9e6ff; --good:#46e0a0; --warn:#ffc65c; --bad:#ff7d9a;
  background: radial-gradient(ellipse at 15% -10%, #0c1c3d 0%, var(--void) 55%); color: var(--ink); font-family: "Geist Variable", "Sora", system-ui, sans-serif; color-scheme: dark; }
.nx a { color: var(--cyan); }
.nx-card { background: linear-gradient(180deg, rgba(14,26,51,.92), rgba(10,19,38,.92)); border: 1px solid var(--line); border-radius: 16px; padding: 16px; min-width: 0; }
.nx-btn { border: 1px solid var(--line); background: var(--panel); border-radius: 11px; padding: 8px 13px; font-size: 14px; color: var(--ink); cursor: pointer; }
.nx-btn:hover:not(:disabled) { border-color: var(--blue); }
.nx-btn:disabled { opacity: .45; cursor: default; }
.nx-btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; font-weight: 500; }
.nx-btn.ghost { background: transparent; }
.nx-btn.danger { color: var(--bad); }
.nx-btn.sm { padding: 5px 10px; font-size: 13px; border-radius: 9px; }
.nx-input { background: var(--void); border: 1px solid var(--line); border-radius: 10px; padding: 8px 11px; color: var(--ink); width: 100%; font-size: 14px; }
.nx-input:focus { outline: none; border-color: var(--blue); }
.nx-label { display: grid; gap: 5px; font-size: 13px; color: var(--dim); }
.nx-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--dim); white-space: nowrap; }
.nx-pill.good { color: var(--good); border-color: rgba(70,224,160,.4); } .nx-pill.warn { color: var(--warn); border-color: rgba(255,198,92,.4); }
.nx-pill.bad { color: var(--bad); border-color: rgba(255,125,154,.4); } .nx-pill.blue { color: var(--cyan); border-color: rgba(95,212,255,.4); }
.nx-eyebrow { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); }
.nx-mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
.nx-dim { color: var(--dim); }
.nx-md { line-height: 1.6; overflow-wrap: anywhere; }
.nx-md p { margin: 0 0 .6em; } .nx-md p:last-child { margin-bottom: 0; }
.nx-md ul, .nx-md ol { margin: .2em 0 .6em; padding-left: 1.3em; } .nx-md li { margin: .15em 0; }
.nx-md h1, .nx-md h2, .nx-md h3 { font-size: 1.02em; font-weight: 600; color: var(--hot); margin: .8em 0 .35em; }
.nx-md code { font-family: "JetBrains Mono", monospace; font-size: .88em; background: var(--void); border: 1px solid var(--line); border-radius: 6px; padding: 0 5px; }
.nx-md pre { background: var(--void); border: 1px solid var(--line); border-radius: 10px; padding: 10px; overflow-x: auto; }
.nx-md pre code { border: 0; padding: 0; }
.nx-md table { border-collapse: collapse; display: block; overflow-x: auto; } .nx-md td, .nx-md th { border: 1px solid var(--line); padding: 4px 8px; }
.nx-scroll { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
}
`;

export function PageTitle({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="nx-eyebrow">{eyebrow}</div>
        <h1 className="m-0 text-2xl font-semibold tracking-tight" style={{ textWrap: 'balance' } as React.CSSProperties}>{title}</h1>
        {sub && <p className="nx-dim m-0 mt-1 text-sm">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
export const Card = ({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) => (
  <div className={`nx-card ${className}`}>
    {(title || action) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h3 className="m-0 text-[15px] font-semibold">{title}</h3>}{action}</div>}
    {children}
  </div>
);
export const Btn = ({ variant = '', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button type="button" className={`nx-btn ${variant} ${className}`} {...p} />;
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input className="nx-input" {...p} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className="nx-input" {...p}>{children}</select>;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="nx-input" {...p} />;
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="nx-label">{label}{children}</label>;
export const Pill = ({ tone = '', children }: { tone?: string; children: ReactNode }) => <span className={`nx-pill ${tone}`}>{children}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="nx-dim rounded-2xl border border-dashed p-5 text-center text-sm" style={{ borderColor: 'var(--line)' }}>{children}</div>;
export const ErrorText = ({ error }: { error: string | null }) => error ? <p className="m-0 text-sm" style={{ color: 'var(--bad)' }}>{error}</p> : null;
export function Markdown({ text }: { text: string }) {
  return <div className="nx-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{text}</ReactMarkdown></div>;
}
export function statusTone(s: string) { return s === 'up' ? 'good' : s === 'slow' ? 'warn' : s === 'down' || s === 'unsupported' ? 'bad' : ''; }
