'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconWarning,
  IconClock,
} from '@/components/landing/icons';
import Image from 'next/image';

export default function DemoPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingStep((s) => Math.min(s + 1, 5));
      }, 1500);
      return () => clearInterval(interval);
    } else {
      setLoadingStep(0);
    }
  }, [loading]);

  // C9: Canonical demo paper — self-hosted fixture based on Vaswani et al. 2017.
  // Contains 1 planted fabrication (LSTM "95% accuracy" claim) + real citations
  // that naturally produce unverifiable verdicts. Served from our own API route
  // so the input text is controlled while all pipeline steps remain genuine.
  const DEMO_PAPER_URL = typeof window !== 'undefined'
    ? `${window.location.origin}/api/demo/fixture-paper`
    : '/api/demo/fixture-paper';

  const loadDemoPaper = () => {
    setUrl(DEMO_PAPER_URL);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');

    try {
      // 1. Create run
      const createRes = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: url.trim() }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error ?? 'Failed to create run');
      }

      const { run_id } = await createRes.json();

      // 2. Navigate to dashboard immediately (Realtime will stream updates)
      router.push(`/run/${run_id}`);

      // 3. Trigger FSM in the background (fire-and-forget from client)
      fetch(`/api/runs/${run_id}/orchestrate`, { method: 'POST' }).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '100vh', background: 'var(--cream)', fontFamily: 'var(--font-body)' }}
    >
      <div style={{ maxWidth: 560, width: '100%', padding: '0 24px' }}>
        <div className="text-center" style={{ marginBottom: 40, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Image src="/logo.png" alt="Popper" width={72} height={72} style={{ marginBottom: 22 }} />
          <h1 className="h1" style={{ fontSize: 40, lineHeight: '46px', marginBottom: 12 }}>
            Run a <span className="accent">verification</span>
          </h1>
          <p className="lead" style={{ fontSize: 16, lineHeight: 1.6 }}>
            Paste an arXiv paper URL and watch Popper extract claims, cross-examine them
            against real sources, and keep only what survives.
          </p>
        </div>

        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 24px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--green)',
              background: 'rgba(14, 183, 112, 0.04)',
              textAlign: 'center',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          >
            <div style={{ position: 'relative', width: 48, height: 48, marginBottom: 24 }}>
              <div style={{ position: 'absolute', inset: 0, border: '3px solid var(--green)', borderRadius: '50%', opacity: 0.2 }}></div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '3px solid transparent',
                  borderTopColor: 'var(--green)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              ></div>
              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
              `}</style>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
              Analyzing arXiv:{url.match(/arxiv\.org\/(?:abs|pdf)\/([0-9.]+)/)?.[1] || 'Paper'}
            </h3>
            <p style={{ color: 'var(--ink-muted)', fontSize: 15, margin: 0, minHeight: 24, transition: 'opacity 0.3s ease' }}>
              {
                [
                  "Connecting to arXiv...",
                  "Fetching paper metadata...",
                  "Initializing Extractor Agent...",
                  "Parsing text & extracting claims...",
                  "Booting Verifier Agent...",
                  "Preparing Claim Graph...",
                ][loadingStep]
              }
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              id="paper-url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://arxiv.org/abs/2401.12345"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px 20px',
                fontSize: 16,
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-btn)',
                outline: 'none',
                fontFamily: 'var(--font-body)',
                background: '#fff',
                color: 'var(--ink)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--green)';
                e.target.style.boxShadow = '0 0 0 4px rgba(14,183,112,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--line)';
                e.target.style.boxShadow = 'none';
              }}
            />

            {/* C9: One-click demo paper shortcut */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                id="load-demo-paper-btn"
                onClick={loadDemoPaper}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  border: '1px solid var(--green)',
                  borderRadius: 'var(--radius-btn)',
                  background: 'rgba(14,183,112,0.06)',
                  color: 'var(--green)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ✦ Try demo paper
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                Pre-loaded with 1 planted fabrication + natural unverifiable claims.
                Runs the full pipeline on controlled input.
              </span>
            </div>

            {error && (
              <p
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--contradicted)',
                  fontSize: 14,
                  margin: 0,
                }}
              >
                <IconWarning size={16} /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !url.trim()}
              id="submit-verification-btn"
              className="button button-round w-full"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              Start verification <IconArrowRight size={16} />
            </button>
          </form>
        )}

        <div
          className="flex justify-center flex-wrap"
          style={{ gap: 24, marginTop: 32, fontSize: 13, color: 'var(--ink-muted)' }}
        >
          <span className="flex items-center" style={{ gap: 6 }}>
            <span style={{ color: 'var(--green)' }}><IconCheck size={15} /></span> Free to run
          </span>
          <span className="flex items-center" style={{ gap: 6 }}>
            <span style={{ color: 'var(--green)' }}><IconCheck size={15} /></span> Live updates
          </span>
          <span className="flex items-center" style={{ gap: 6 }}>
            <span style={{ color: 'var(--green)' }}><IconCheck size={15} /></span> Full audit trail
          </span>
        </div>

        <div className="text-center" style={{ marginTop: 28 }}>
          <a href="/" className="link-green" style={{ fontSize: 14, justifyContent: 'center' }}>
            <IconArrowLeft size={15} /> Back to Popper
          </a>
        </div>
      </div>
    </div>
  );
}
