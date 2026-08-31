# Security policy

Forge runs marketing automation against real businesses' accounts — it holds Google
Business Profile and Meta credentials, customer contact lists, and Stripe billing state. A
vulnerability here reaches somebody's actual clients. Reports are taken seriously and
answered.

## Reporting a vulnerability

**Do not open a public issue.**

Report privately through
[GitHub Security Advisories](https://github.com/Rahulsanecdote/Forge/security/advisories/new),
or by email to **hello@getforge.ai** with `SECURITY` in the subject.

Useful things to include, in rough order of value:

- What an attacker can do, and what they need to start (network access? a portal link? an
  operator session?).
- The steps to reproduce it. A failing request, a diff, or a script beats prose.
- Which version or commit you tested.
- Whether you have already told anyone else.

You do not need a working exploit. A clear description of a flaw is worth reporting even if
you have not built the attack.

### What to expect

Forge is maintained by one person, so these are honest targets rather than a corporate SLA:

| | |
|---|---|
| First response | within 3 working days |
| Assessment and severity | within 7 days |
| Fix for a high-severity issue | as fast as it can be done well |
| Public disclosure | after a fix ships, coordinated with you |

You will be credited in the advisory unless you would rather not be. There is no bug bounty
— this is an unfunded open-source project, and pretending otherwise would waste your time.

If you do not hear back within a week, assume the message went astray and chase it. That is
not rudeness, it is a favour.

## Scope

**In scope** — anything that lets someone:

- reach another client's data through the client portal
- reach the operator dashboard without the operator password
- get Forge to publish, send, or delete something on a business's behalf without approval
- read secrets (Supabase service-role key, provider API keys, Stripe or Twilio secrets)
  from a response, a log, a client bundle, or a build artefact
- forge a webhook (Stripe or Twilio) that Forge accepts as genuine
- make Forge issue requests to internal network addresses (SSRF)
- bypass the opt-out suppression list and contact someone who unsubscribed

**Out of scope** — mostly because they are already documented as true:

- The consequences of the single shared operator password: no per-user accounts, no MFA,
  no rate limiting on the login form. These are known properties of the current trust
  model, written up in [docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md). A report that
  the login form permits unlimited guesses tells us nothing new — a report of a way *past*
  the password does.
- Anything requiring an already-compromised operator session or server environment. An
  operator with a valid session is trusted by design and can do everything.
- Vulnerabilities in a deployment's own misconfiguration (a service-role key placed in a
  `NEXT_PUBLIC_` variable, a `.env` committed to a fork) rather than in Forge's code.
- Findings from an automated scanner with no demonstrated impact.
- Missing hardening headers, absent rate limits, or version-disclosure reports without a
  concrete attack.

If you are unsure whether something is in scope, report it. A wrongly-scoped report costs a
short reply; an unreported flaw costs somebody's clients.

## Supported versions

Forge has not cut a tagged release yet. Until it does, **`main` is the only supported
version** and fixes land there. Self-hosters should track `main`.

## What you can safely test

Test against **your own deployment**. Do not test against
`forge-agent-ten.vercel.app` or any Forge instance you do not operate — that instance runs
real client data, and probing it means probing somebody's business.

Setting up a local instance takes a Supabase project and one model key; see
[docs/RUNNING_LOCALLY.md](./docs/RUNNING_LOCALLY.md), which can run fully offline against
Ollama.

## Known limitations

Some properties of Forge are deliberate trade-offs rather than undiscovered bugs, and it
would be dishonest to let a self-hoster find them out by accident.
[docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md) sets out the trust boundaries, what
protects each one, and the specific limitations we know about — read it before deploying
Forge anywhere it can reach a real client account.
