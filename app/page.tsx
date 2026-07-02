'use client';

import { useState } from 'react';

interface BrandVoice {
  tone: string[];
  about: string;
  audience: string;
  dos: string[];
  donts: string[];
  samplePosts: string[];
  bannedPhrases: string[];
}
interface ClientConfig {
  slug: string;
  name: string;
  industry?: string;
  website?: string;
  locations: number;
  brandVoice: BrandVoice;
}
interface SocialPost {
  caption: string;
  hashtags: string[];
  image_direction: string;
}
interface ReviewReply {
  author: string;
  rating: number;
  reply: string;
  needs_manager: boolean;
}

const EXAMPLES = [
  {
    name: 'Acme Coffee',
    industry: 'Specialty cafe',
    description: 'A neighborhood specialty coffee shop. Warm, unpretentious, obsessed with good beans and regulars who feel like family.',
  },
  {
    name: 'Bright Smile Dental',
    industry: 'Dental practice',
    description: 'A gentle family dental practice focused on anxiety-free care, clear pricing, and treating nervous patients with patience.',
  },
  {
    name: 'Iron Forge Gym',
    industry: 'Strength gym',
    description: 'A no-frills strength-training gym for serious lifters. Blunt, motivating, community-driven — zero fitness-influencer fluff.',
  },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export default function Home() {
  // Step 1 — business + brand voice
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  // Step 2 — mode + outputs
  const [mode, setMode] = useState<'posts' | 'reviews'>('posts');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'facebook' | 'google_business'>('instagram');
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [reviewsText, setReviewsText] = useState(
    '5 | Best flat white in the neighborhood, the staff remembered my name!\n2 | Waited 20 minutes and my order was wrong. Not impressed.',
  );
  const [replies, setReplies] = useState<ReviewReply[] | null>(null);
  const [working, setWorking] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function loadExample() {
    const ex = EXAMPLES[Math.floor(Date.now() / 1000) % EXAMPLES.length];
    setName(ex.name);
    setIndustry(ex.industry);
    setDescription(ex.description);
  }

  async function draftVoice() {
    setError(null);
    setOnboarding(true);
    setConfig(null);
    setPosts(null);
    setReplies(null);
    try {
      const { config } = await postJson<{ config: ClientConfig }>('/api/onboard', {
        name,
        description,
        industry: industry || undefined,
      });
      setConfig(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setOnboarding(false);
    }
  }

  async function generatePosts() {
    if (!config) return;
    setError(null);
    setWorking(true);
    setPosts(null);
    try {
      const res = await postJson<{ posts: SocialPost[] }>('/api/generate', {
        config,
        topic,
        platform,
        count: 3,
      });
      setPosts(res.posts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  async function generateReplies() {
    if (!config) return;
    setError(null);
    setWorking(true);
    setReplies(null);
    const parsed = reviewsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rating, ...rest] = line.split('|');
        return { rating: Number(rating.trim()), text: rest.join('|').trim() };
      })
      .filter((r) => r.rating >= 1 && r.rating <= 5 && r.text);
    if (!parsed.length) {
      setError('Add reviews as "rating | text", one per line (e.g. "5 | Loved it").');
      setWorking(false);
      return;
    }
    try {
      const res = await postJson<{ replies: ReviewReply[] }>('/api/reviews', { config, reviews: parsed });
      setReplies(res.replies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="badge">
            <span className="dot" /> Open source · bring your own model
          </div>
          <h1>
            An AI marketing agent that<br />
            speaks <span className="grad">your business&apos;s voice</span>
          </h1>
          <p className="sub">
            Describe your business once. Forge drafts its brand voice, then writes on-brand social posts
            and review replies — grounded in that voice, never inventing facts.
          </p>
          <p className="tagline">Architect plans · Forge executes</p>
        </div>
      </section>

      <div className="wrap">
        {/* Step 1 */}
        <div className="panel">
          <div className="step-head">
            <span className="step-num">1</span>
            <h2>Describe your business</h2>
          </div>
          <p className="step-desc">
            No forms, no setup. One sentence is enough.{' '}
            <button type="button" className="example-btn" onClick={loadExample}>
              try an example
            </button>
          </p>
          <div className="row">
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label htmlFor="name">Business name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Coffee" />
            </div>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label htmlFor="industry">Industry (optional)</label>
              <input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Specialty cafe"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="desc">What makes it tick?</label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A neighborhood specialty coffee shop — warm, unpretentious, obsessed with good beans."
            />
          </div>
          <button className="btn" onClick={draftVoice} disabled={onboarding || !name.trim() || !description.trim()}>
            {onboarding ? (
              <>
                <span className="spin" /> Forging brand voice…
              </>
            ) : (
              'Draft brand voice →'
            )}
          </button>
        </div>

        {/* Brand voice result */}
        {config && (
          <div className="panel">
            <div className="step-head">
              <span className="step-num" style={{ background: 'rgba(55,211,153,0.14)', color: 'var(--good)', borderColor: 'rgba(55,211,153,0.3)' }}>
                ✓
              </span>
              <h2>{config.name}&apos;s brand voice</h2>
            </div>
            <div className="kv">
              <div className="k">Tone</div>
              <div className="chips">
                {config.brandVoice.tone.map((t) => (
                  <span className="chip" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {config.brandVoice.about && (
              <div className="kv">
                <div className="k">About</div>
                <div>{config.brandVoice.about}</div>
              </div>
            )}
            {config.brandVoice.audience && (
              <div className="kv">
                <div className="k">Audience</div>
                <div>{config.brandVoice.audience}</div>
              </div>
            )}
            <div className="two-col">
              {config.brandVoice.dos.length > 0 && (
                <div className="kv">
                  <div className="k">Always</div>
                  <ul className="tick">
                    {config.brandVoice.dos.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {config.brandVoice.donts.length > 0 && (
                <div className="kv">
                  <div className="k">Never</div>
                  <ul className="tick">
                    {config.brandVoice.donts.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {config.brandVoice.bannedPhrases.length > 0 && (
              <div className="kv">
                <div className="k">Banned clichés</div>
                <div className="chips">
                  {config.brandVoice.bannedPhrases.map((b) => (
                    <span className="chip ban" key={b}>
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2 */}
        {config && (
          <div className="panel">
            <div className="step-head">
              <span className="step-num">2</span>
              <h2>Put it to work</h2>
            </div>
            <p className="step-desc">The same brand voice drives every tool.</p>

            <div className="tabs">
              <button className={`tab ${mode === 'posts' ? 'active' : ''}`} onClick={() => setMode('posts')}>
                Social posts
              </button>
              <button className={`tab ${mode === 'reviews' ? 'active' : ''}`} onClick={() => setMode('reviews')}>
                Review replies
              </button>
            </div>

            {mode === 'posts' ? (
              <>
                <div className="row">
                  <div className="field" style={{ flex: '2 1 260px' }}>
                    <label htmlFor="topic">What should the posts be about?</label>
                    <input
                      id="topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Launching a new oat-milk cold brew this weekend"
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 150px' }}>
                    <label htmlFor="platform">Platform</label>
                    <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="google_business">Google Business</option>
                    </select>
                  </div>
                </div>
                <button className="btn" onClick={generatePosts} disabled={working || !topic.trim()}>
                  {working ? (
                    <>
                      <span className="spin" /> Writing…
                    </>
                  ) : (
                    'Generate 3 posts →'
                  )}
                </button>

                {posts && posts.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    {posts.map((p, i) => (
                      <div className="post" key={i}>
                        <p className="caption">{p.caption}</p>
                        {p.hashtags?.length > 0 && (
                          <div className="tags">{p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</div>
                        )}
                        {p.image_direction && <div className="img-dir">🎨 {p.image_direction}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="reviews">Paste reviews — one per line, as “rating | text”</label>
                  <textarea
                    id="reviews"
                    value={reviewsText}
                    onChange={(e) => setReviewsText(e.target.value)}
                    style={{ minHeight: 110 }}
                  />
                </div>
                <button className="btn" onClick={generateReplies} disabled={working}>
                  {working ? (
                    <>
                      <span className="spin" /> Drafting replies…
                    </>
                  ) : (
                    'Draft on-brand replies →'
                  )}
                </button>

                {replies && replies.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    {replies.map((r, i) => (
                      <div className="post reply" key={i}>
                        <div className="head">
                          <span className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                          {r.needs_manager && <span className="flag">⚑ Needs manager</span>}
                        </div>
                        <p className="reply-text">{r.reply}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="features">
          <div className="feature">
            <h3>🎯 One voice, every channel</h3>
            <p>Brand voice is drafted once and reused across posts, replies, reports and more — consistency by construction.</p>
          </div>
          <div className="feature">
            <h3>🛡️ Never invents facts</h3>
            <p>Forge&apos;s tools are built to refuse fabrication — no made-up metrics, prices, or claims about your business.</p>
          </div>
          <div className="feature">
            <h3>🔌 Bring your own model</h3>
            <p>Anthropic, OpenAI, Google, or a fully local model via Ollama. Self-host the whole stack — you own it.</p>
          </div>
        </div>
      </div>

      <footer>
        Forge · open-source AI marketing agent · MIT licensed ·{' '}
        <a href="https://github.com/Rahulsanecdote/forge" target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </footer>
    </main>
  );
}
