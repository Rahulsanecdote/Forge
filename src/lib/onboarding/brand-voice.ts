// Derive a starter brand voice (dos / donts / sample posts) from an operator's
// onboarding intake. Pure and unit-tested — no env/IO.
//
// Sample posts are few-shot examples the content generator learns from, so they must
// read as clean, grammatical copy regardless of how long the intake answers are. An
// earlier version interpolated the geographic market and primary goal *mid-sentence*
// ("{name} helps {market} with {service}"), which produced broken copy when those
// fields were full sentences. The long-form market/goal now live only in the `dos`
// directives (a "Label: value" format that reads fine at any length), and sample
// posts are built from the short, safe fields (name, services, category) with the CTA
// as its own trailing sentence.

export interface OnboardingBrandVoiceInput {
  name: string;
  industry: string;
  services: string[];
  geographicMarket: string;
  primaryGoal: string;
  primaryCta: string;
}

export interface OnboardingBrandVoice {
  dos: string[];
  donts: string[];
  samplePosts: string[];
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Strip trailing whitespace/punctuation so a fragment can be composed into a sentence.
function sentenceFragment(value: string): string {
  return value.trim().replace(/[\s.。!?]+$/g, '');
}

// A trailing full sentence, or '' when the source is empty.
function ensureSentence(value: string): string {
  const cleaned = sentenceFragment(value);
  return cleaned ? `${cleaned}.` : '';
}

function directive(label: string, value: string): string | null {
  const cleaned = sentenceFragment(value);
  return cleaned ? `${label}: ${cleaned}.` : null;
}

// Join services into a natural phrase: "coffee", "coffee and espresso",
// "coffee, tea, and espresso". Falls back to the category when there are none.
function servicesPhrase(services: string[], fallbackCategory: string): string {
  if (services.length === 0) return fallbackCategory ? fallbackCategory.toLowerCase() : 'what we do';
  if (services.length === 1) return services[0];
  if (services.length === 2) return `${services[0]} and ${services[1]}`;
  return `${services.slice(0, -1).join(', ')}, and ${services[services.length - 1]}`;
}

export function brandVoiceFromOnboarding(input: OnboardingBrandVoiceInput): OnboardingBrandVoice {
  const services = uniqueList(input.services).slice(0, 6);
  const cta = sentenceFragment(input.primaryCta);
  const goal = sentenceFragment(input.primaryGoal);
  const market = sentenceFragment(input.geographicMarket);
  const category = sentenceFragment(input.industry);

  const ctaSentence = ensureSentence(cta);
  const offer = servicesPhrase(services, category);

  // Always two grammatical sample posts, built from short/safe fields only.
  const first = [`${input.name} is built around ${offer}.`, ctaSentence || 'Reach out to learn more.']
    .filter(Boolean)
    .join(' ');
  const second = category
    ? [`Looking for a ${category.toLowerCase()} you can trust? Keep ${input.name} in mind.`, ctaSentence]
        .filter(Boolean)
        .join(' ')
    : [`Keep ${input.name} in mind when you're ready.`, ctaSentence].filter(Boolean).join(' ');

  return {
    dos: [
      ...services.map((service) => `Only reference ${service} when supported by the source material.`),
      directive('Focus on this geographic market', market),
      directive('Optimize toward', goal),
      directive('Use this primary call to action', cta),
    ].filter((value): value is string => Boolean(value)),
    donts: ['Do not invent services, offers, locations, or performance claims.'],
    samplePosts: [first, second],
  };
}
