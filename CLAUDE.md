# HotelTrack

> **Heads up on Next.js:** This project uses a version of Next.js with breaking
> changes vs. what may be in training data. Always read the relevant guide in
> `node_modules/next/dist/docs/` before writing Next.js code, and heed
> deprecation notices. (See imported rules below.)

@AGENTS.md

---

## What this is

**HotelTrack** — a multi-tenant SaaS for **marketing agencies that manage hotel
clients**. It proves that the agency's content (organic Instagram posts, paid
Meta ads, influencer collaborations) drives **real bookings on the hotel's own
website**.

The core value proposition is closing the loop from *content → visit → booking →
revenue*, plus Meta ad ROI — so an agency can show a hotel exactly which of its
marketing efforts produced paying guests.

## How it works

1. Agencies **sign up** and pay a **monthly subscription**.
2. They **add hotel clients**.
3. For each hotel, they install a small **JavaScript tracking snippet** on the
   hotel's website.
4. They generate **UTM-tagged links** and **coupon codes** for every piece of
   content.
5. The snippet **captures which content sent each visitor** and **records when a
   booking happens**.
6. The agency sees a **dashboard per hotel** showing
   **content → visits → bookings → revenue**, plus **Meta ad ROI**.

## User roles

| Role | Who | Access |
| --- | --- | --- |
| **Super Admin** | Platform owner (me) | Full platform access |
| **Agency Admin** | Paying customer | Manages their agency, its hotels, content, billing |
| **Hotel Client** | The hotel | **View-only** access to their own hotel's data |

## Tech stack

- **Framework:** Next.js 14 App Router + **TypeScript**
- **Database:** PostgreSQL via **Prisma**
- **Auth:** **Clerk**
- **Billing:** **Stripe**
- **Email:** **Resend**
- **Charts:** **Recharts**
- **Tracking snippet:** **vanilla JS**
- **Exports:** **jsPDF** (PDF) and **xlsx** (spreadsheets)
- **Hosting:** **Vercel**

## CRITICAL RULE — multi-tenancy isolation

This is a **multi-tenant** product. **Every database table has an `agencyId`
column.** **Every single database query MUST filter by `agencyId`** so that no
agency can ever see another agency's data. There are no exceptions. Treat any
query without an `agencyId` filter as a security bug.

## Security

- **Meta access tokens are encrypted with AES-256-GCM before being stored.**
- **Never log tokens.**
- **Never expose tokens to the frontend.**

## How we build — 16 numbered steps

We build this product in **16 numbered steps**. After **each** step I will
**stop** and tell you:

1. **What I built**
2. **How to test it**
3. **What I need from you** before the next step

I will not run ahead to the next step without checking in.
