/**
 * Forge — Blog content.
 * Static posts for the SEO hub. Migrate to MDX or Supabase later if needed.
 * `body` is an array of blocks rendered by the post template.
 */

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'quote'; text: string };

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string;        // ISO
  readMins: number;
  tag: string;
  body: Block[];
}

export const posts: Post[] = [
  {
    slug: 'nj-restaurants-google-search-2026',
    title: 'How NJ Restaurants Can Dominate Local Google Search in 2026',
    excerpt:
      'Most New Jersey restaurants are invisible on Google — not because the food is bad, but because nobody optimized the profile. Here\u2019s how to fix that.',
    date: '2026-04-15',
    readMins: 6,
    tag: 'Local SEO',
    body: [
      { type: 'p', text: 'When someone in your town searches \u201Crestaurants near me,\u201D Google shows a handful of results in the map pack. If your restaurant isn\u2019t in that top three, you\u2019re losing customers to competitors who may not even have better food \u2014 just a better Google Business Profile.' },
      { type: 'h2', text: 'Why the map pack matters more than your website' },
      { type: 'p', text: 'For local searches, the map pack sits above the organic results. It\u2019s the first thing people see, and it\u2019s where the majority of clicks go. For a restaurant, ranking here is often worth more than any amount of paid advertising.' },
      { type: 'p', text: 'The good news: most NJ restaurants have never seriously optimized their profile, which means the bar to outrank them is low.' },
      { type: 'h2', text: 'The five things that actually move rankings' },
      { type: 'ul', items: [
        'A complete, accurate Google Business Profile \u2014 hours, menu, photos, attributes.',
        'Consistent name, address, and phone number across every online directory.',
        'A steady stream of recent reviews (recency matters as much as rating).',
        'Regular posts and photo updates that signal the profile is active.',
        'Local keywords in your business description and posts.',
      ] },
      { type: 'quote', text: 'Recency beats volume. Ten reviews in the last month signals more to Google than a hundred reviews from two years ago.' },
      { type: 'h2', text: 'The problem: it never stops' },
      { type: 'p', text: 'Optimization isn\u2019t a one-time task. Google rewards profiles that stay active \u2014 fresh photos, new posts, ongoing review responses. For a busy restaurant owner, keeping that up week after week is where it falls apart.' },
      { type: 'p', text: 'This is exactly the kind of continuous, repetitive work an AI agent handles well. Forge keeps your profile active, drafts review responses, and publishes local content on a schedule \u2014 so your ranking climbs while you focus on the kitchen.' },
    ],
  },
  {
    slug: 'real-cost-marketing-agencies-nj',
    title: 'The Real Cost of Marketing Agencies for NJ Small Businesses',
    excerpt:
      'That $2,500/month retainer isn\u2019t buying what you think. Here\u2019s where the money actually goes \u2014 and a better way to spend it.',
    date: '2026-04-22',
    readMins: 5,
    tag: 'Business',
    body: [
      { type: 'p', text: 'If you\u2019ve ever hired a marketing agency, you know the pattern: a big monthly retainer, a slick monthly report, and a nagging feeling that you\u2019re not sure what you\u2019re actually paying for.' },
      { type: 'h2', text: 'Where your retainer really goes' },
      { type: 'p', text: 'Most small-business agency work breaks down into a short list of repetitive tasks: posting to social media, updating your Google profile, responding to reviews, and assembling a monthly report. None of it is complex. Most of it is copy-paste.' },
      { type: 'p', text: 'What you\u2019re paying for is the hours of junior staff doing that manual work \u2014 marked up considerably.' },
      { type: 'quote', text: 'You\u2019re not paying for strategy. You\u2019re paying for someone\u2019s time to do tasks a machine can now do better.' },
      { type: 'h2', text: 'The math most owners never run' },
      { type: 'ul', items: [
        'A typical NJ agency retainer runs $1,500\u2013$3,000/month.',
        'The actual work \u2014 posts, profile updates, review responses \u2014 is a few hours a week.',
        'You\u2019re often the lowest-priority client for their most junior staff.',
        'Reports are designed to look impressive, not to be acted on.',
      ] },
      { type: 'h2', text: 'The alternative' },
      { type: 'p', text: 'AI has collapsed the cost of this work. An agent can post consistently, monitor and respond to every review, keep your profile optimized, and generate a clear report \u2014 continuously, not a few hours a week.' },
      { type: 'p', text: 'That\u2019s the model Forge is built on: the same output a small agency produces, run by an AI agent, at a fraction of the retainer. You keep the results and stop paying for the markup.' },
    ],
  },
  {
    slug: 'bergen-county-business-invisible-google-maps',
    title: 'Why Your Bergen County Business Is Invisible on Google Maps',
    excerpt:
      'You know your business exists. Google isn\u2019t so sure. Here are the specific reasons local businesses don\u2019t show up \u2014 and how to change it.',
    date: '2026-04-29',
    readMins: 5,
    tag: 'Local SEO',
    body: [
      { type: 'p', text: 'You search your own business name and it shows up fine. But search the service you offer \u2014 \u201Cplumber in Hackensack,\u201D \u201Csalon near Paramus\u201D \u2014 and you\u2019re nowhere. That gap is where customers are going to your competitors.' },
      { type: 'h2', text: 'The usual suspects' },
      { type: 'ul', items: [
        'Incomplete Google Business Profile \u2014 missing categories, hours, or service areas.',
        'Inconsistent listings \u2014 your address or phone number differs across directories.',
        'Too few recent reviews \u2014 Google favors businesses with steady, fresh feedback.',
        'A dormant profile \u2014 no recent posts or photos tells Google you\u2019re inactive.',
        'Wrong or missing primary category \u2014 one of the biggest ranking factors, often overlooked.',
      ] },
      { type: 'quote', text: 'Your primary category is one of the strongest signals Google uses. Get it wrong and you\u2019re invisible for the searches that matter.' },
      { type: 'h2', text: 'Why fixing it once isn\u2019t enough' },
      { type: 'p', text: 'Even businesses that get optimized slip back down. Competitors keep collecting reviews and posting updates. If your profile goes quiet, your ranking erodes. Local SEO is a game of consistency, not a one-time setup.' },
      { type: 'h2', text: 'How Forge keeps you visible' },
      { type: 'p', text: 'Forge treats your visibility as an ongoing job, not a project. The agent keeps your profile complete and consistent, requests and responds to reviews, and publishes local content on a schedule \u2014 so you climb the map pack and stay there.' },
      { type: 'p', text: 'If your Bergen County business is invisible right now, that\u2019s not permanent. It\u2019s a fixable, and mostly automatable, problem.' },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
