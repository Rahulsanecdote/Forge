'use client';

import { useState } from 'react';
import { createOnboardedClient } from '@/app/dashboard/actions';

interface Analysis {
  businessType: string | null;
  services: string[];
  suggestedCategory: string | null;
  tone: string[];
  locations: number | null;
  summary: string | null;
  sourceUrl: string;
  evidence: string[];
  warnings: string[];
}

type Step = 'business' | 'confirm' | 'voice';

const STEP_LABELS: Array<{ id: Step; label: string }> = [
  { id: 'business', label: 'Business' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'voice', label: 'Voice' },
];

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>('business');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [category, setCategory] = useState('');
  const [locations, setLocations] = useState('1');
  const [about, setAbout] = useState('');
  const [tone, setTone] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeIndex = STEP_LABELS.findIndex((item) => item.id === step);

  async function analyze() {
    if (!name.trim() || !website.trim()) {
      setError('Enter both a business name and website URL.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/dashboard/api/onboarding/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, website }),
      });
      const payload = await response.json() as { analysis?: Analysis; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error ?? 'Analysis failed.');
      setAnalysis(payload.analysis);
      setWebsite(payload.analysis.sourceUrl);
      setCategory(payload.analysis.suggestedCategory ?? payload.analysis.businessType ?? '');
      setLocations(String(payload.analysis.locations ?? 1));
      setAbout(payload.analysis.summary ?? '');
      setTone(payload.analysis.tone);
      setStep('confirm');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The website could not be analyzed.');
    } finally {
      setLoading(false);
    }
  }

  function toggleTone(value: string) {
    setTone((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">Setup progress</div>
        <ol className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-1">
          {STEP_LABELS.map((item, index) => (
            <li
              key={item.id}
              className={`flex min-h-12 items-center gap-3 border px-3 py-2 font-mono text-xs ${
                index === activeIndex
                  ? 'border-gold bg-gold-dim text-ink'
                  : index < activeIndex
                    ? 'border-emerald-400/30 text-emerald-300'
                    : 'border-line text-muted-dark'
              }`}
            >
              <span className="w-5 text-center">{index < activeIndex ? 'OK' : `0${index + 1}`}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </aside>

      <section className="border border-gold-border bg-surface/70 p-6 md:p-8">
        <div className="mb-8 h-0.5 bg-line">
          <div className="h-full bg-gold transition-all" style={{ width: `${((activeIndex + 1) / 3) * 100}%` }} />
        </div>

        {error && (
          <div className="mb-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs leading-5 text-red-100">
            {error}
          </div>
        )}

        {step === 'business' && (
          <div>
            <div className="section-label">Step 01 / Business</div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Start with the source</h2>
            <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
              Forge reads the public homepage and uses only evidence present in its metadata,
              structured data, and visible headings.
            </p>
            <div className="mt-8 grid gap-5">
              <label>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Business name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-gold/60" placeholder="Bright Smile Dental" />
              </label>
              <label>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Website</span>
                <input value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-gold/60" placeholder="https://example.com" inputMode="url" />
              </label>
            </div>
            <button type="button" onClick={analyze} disabled={loading} className="mt-8 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft disabled:cursor-wait disabled:opacity-50">
              {loading ? 'Reading website...' : 'Analyze website'}
            </button>
          </div>
        )}

        {step === 'confirm' && analysis && (
          <div>
            <div className="section-label">Step 02 / Confirm</div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Confirm what Forge found</h2>
            <p className="mt-3 font-sans text-sm leading-6 text-muted">
              These findings belong to <span className="text-ink">{analysis.sourceUrl}</span>. Empty fields mean the page did not provide enough evidence.
            </p>

            <dl className="mt-7 grid gap-px border border-gold-border bg-gold-border sm:grid-cols-2">
              <div className="bg-bg p-4">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">Business type</dt>
                <dd className="mt-2 text-sm text-ink">{analysis.businessType ?? 'Not found'}</dd>
              </div>
              <div className="bg-bg p-4">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">Locations</dt>
                <dd className="mt-2 text-sm text-ink">{analysis.locations ?? 'Not found'}</dd>
              </div>
              <div className="bg-bg p-4 sm:col-span-2">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">Services detected</dt>
                <dd className="mt-2 text-sm text-ink">{analysis.services.length ? analysis.services.join(', ') : 'Not found'}</dd>
              </div>
            </dl>

            {analysis.warnings.length > 0 && (
              <ul className="mt-5 space-y-2 border border-amber-300/20 bg-amber-300/5 p-4 font-mono text-[11px] leading-5 text-amber-100">
                {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Primary Google category</span>
                <input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-gold/60" placeholder="Confirm manually" />
              </label>
              <label>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Locations</span>
                <input value={locations} onChange={(event) => setLocations(event.target.value)} type="number" min="1" max="10000" className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-gold/60" />
              </label>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep('business')} className="border border-line-mid px-5 py-3 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">Back</button>
              <button type="button" onClick={() => category.trim() ? setStep('voice') : setError('Confirm the primary category before continuing.')} className="bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg hover:bg-gold-soft">Confirm findings</button>
            </div>
          </div>
        )}

        {step === 'voice' && analysis && (
          <form action={createOnboardedClient}>
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="website" value={website} />
            <input type="hidden" name="industry" value={category} />
            <input type="hidden" name="locations" value={locations} />
            <input type="hidden" name="tone" value={tone.join('\n')} />
            <input type="hidden" name="services" value={analysis.services.join('\n')} />
            <div className="section-label">Step 03 / Voice</div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Set the factual guardrails</h2>
            <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
              Review the source summary and tone before creating the client. Nothing is published by this step.
            </p>
            <label className="mt-7 block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">About the business</span>
              <textarea name="about" value={about} onChange={(event) => setAbout(event.target.value)} rows={4} required className="mt-2 w-full resize-y border border-line-mid bg-bg px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-gold/60" />
            </label>
            <div className="mt-6">
              <div className="font-mono text-[11px] uppercase tracking-wide text-muted">Tone</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['warm', 'community-focused', 'professional', 'premium', 'energetic', 'direct'].map((value) => (
                  <button key={value} type="button" onClick={() => toggleTone(value)} className={`border px-3 py-2 font-mono text-xs ${tone.includes(value) ? 'border-gold bg-gold-dim text-gold' : 'border-line-mid text-muted'}`}>{value}</button>
                ))}
              </div>
            </div>
            <label className="mt-6 block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Audience</span>
              <input name="audience" required className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-gold/60" placeholder="Who this business serves" />
            </label>
            <label className="mt-6 block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Phrases and claims to avoid</span>
              <textarea name="banned_phrases" rows={3} className="mt-2 w-full resize-y border border-line-mid bg-bg px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-gold/60" placeholder="One phrase per line" />
            </label>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep('confirm')} className="border border-line-mid px-5 py-3 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">Back</button>
              <button type="submit" className="bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg hover:bg-gold-soft">Create client</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
