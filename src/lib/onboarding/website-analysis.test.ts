import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeWebsiteHtml } from './website-analysis';

test('extracts a dental business from its own structured data and copy', () => {
  const result = analyzeWebsiteHtml(`
    <html><head>
      <title>Bright Smile Dental | Family Dentist</title>
      <meta name="description" content="Trusted family dental care, implants, and whitening." />
      <script type="application/ld+json">{
        "@context":"https://schema.org", "@type":"Dentist", "name":"Bright Smile Dental",
        "address":{"streetAddress":"10 Main Street","addressLocality":"Jersey City"},
        "makesOffer":[{"itemOffered":{"@type":"Service","name":"Dental implants"}}]
      }</script>
    </head><body><h1>Comfortable care for every smile</h1></body></html>
  `, 'https://brightsmile.example');

  assert.equal(result.suggestedCategory, 'Dentist');
  assert.deepEqual(result.services, ['Dental implants', 'whitening', 'implants']);
  assert.equal(result.locations, 1);
  assert.ok(result.tone.includes('professional'));
  assert.ok(!result.services.includes('Coffee'));
});

test('extracts coffee details without leaking them into unrelated businesses', () => {
  const result = analyzeWebsiteHtml(`
    <html><head>
      <title>Hidden Grounds Coffee Shop</title>
      <meta property="og:description" content="Neighborhood coffee, espresso, pastries, and a warm welcome." />
      <script type="application/ld+json">{"@type":"CafeOrCoffeeShop","address":"8 First Ave"}</script>
    </head><body><h1>Your local cafe</h1></body></html>
  `, 'https://hiddengrounds.example');

  assert.equal(result.suggestedCategory, 'Coffee Shop');
  assert.deepEqual(result.services, ['coffee', 'espresso', 'pastries']);
  assert.equal(result.locations, 1);
  assert.ok(result.tone.includes('community-focused'));
  assert.ok(result.tone.includes('warm'));
});

test('reports absent evidence instead of inventing generic findings', () => {
  const result = analyzeWebsiteHtml('<html><head><title>Northstar</title></head><body><h1>Welcome</h1></body></html>', 'https://northstar.example');

  assert.equal(result.businessType, null);
  assert.equal(result.suggestedCategory, null);
  assert.deepEqual(result.services, []);
  assert.deepEqual(result.tone, []);
  assert.equal(result.locations, null);
  assert.equal(result.warnings.length, 4);
});
