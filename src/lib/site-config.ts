/**
 * Forge — Central site configuration.
 * Single source of truth for nav, pricing tiers, services, and metadata.
 * Edit here; every page reads from this.
 */

export const site = {
  name: 'Forge',
  domain: 'https://getforge.ai',
  tagline: 'AI that runs your marketing. While you run your business.',
  description:
    'AI-native marketing automation for small businesses. Local SEO, social content, reputation management, and reporting — run by an AI agent, not a bloated agency.',
  email: 'hello@getforge.ai',
  github: 'https://github.com/YOUR_ORG/forge-agent',
  calendly: 'https://calendly.com/YOUR_HANDLE/forge-audit', // replace with real link
  location: 'New Jersey',
} as const;

export const navLinks = [
  { label: 'Services', href: '/#services' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
] as const;

export interface Service {
  no: string;
  title: string;
  desc: string;
  points: string[];
}

export const services: Service[] = [
  {
    no: '01',
    title: 'Local SEO & Google Business',
    desc: 'Get found when customers search. We optimize your Google Business Profile and local presence so you rank where it counts.',
    points: ['Google Business optimization', 'Local keyword targeting', 'Citation building', 'Map pack ranking'],
  },
  {
    no: '02',
    title: 'Social Content Engine',
    desc: 'On-brand posts, generated and scheduled automatically. Your voice, your cadence — without you writing a word.',
    points: ['AI-written, brand-matched posts', 'Auto-scheduling', 'Multi-platform publishing', 'Content calendar'],
  },
  {
    no: '03',
    title: 'Reputation Management',
    desc: 'Every review monitored, every response drafted. Turn feedback into a growth engine instead of a fire drill.',
    points: ['Review monitoring', 'AI-drafted responses', 'Sentiment tracking', 'Reputation alerts'],
  },
  {
    no: '04',
    title: 'Performance Reporting',
    desc: 'Clear monthly reports that show what moved. No jargon, no fluff — just the numbers that matter to your business.',
    points: ['Automated monthly reports', 'Traffic & ranking trends', 'Review growth', 'Plain-English insights'],
  },
];

export interface Tier {
  key: string;
  name: string;
  price: number;
  cadence: string;
  tagline: string;
  best: string;
  featured: boolean;
  features: string[];
}

export const tiers: Tier[] = [
  {
    key: 'spark',
    name: 'Spark',
    price: 800,
    cadence: '/mo',
    tagline: 'For single-location businesses getting serious about being found.',
    best: 'Best for solo operators',
    featured: false,
    features: [
      'Google Business optimization',
      '8 social posts / month',
      'Review monitoring + alerts',
      'Monthly performance report',
      'Email support',
    ],
  },
  {
    key: 'furnace',
    name: 'Furnace',
    price: 1200,
    cadence: '/mo',
    tagline: 'For growing businesses that need consistent output across channels.',
    best: 'Most popular',
    featured: true,
    features: [
      'Everything in Spark',
      '16 social posts / month',
      'AI-drafted review responses',
      'Local SEO + citation building',
      'Bi-weekly reporting',
      'Priority support',
    ],
  },
  {
    key: 'foundry',
    name: 'Foundry',
    price: 1800,
    cadence: '/mo',
    tagline: 'For multi-location and aggressive-growth businesses.',
    best: 'Best for multi-location',
    featured: false,
    features: [
      'Everything in Furnace',
      'Unlimited social posts',
      'Multi-location management',
      'Dedicated strategy calls',
      'Weekly reporting',
      'Custom campaigns',
      'Direct line to founder',
    ],
  },
];
