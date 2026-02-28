# LocalLuxe Collection Brand Guidelines

**Updated:** January 2026  
**Based on:** Luxe Packet Design System

---

## Brand Overview

LocalLuxe Collection represents the premium tier of LocalVR's vacation rental management services. The brand communicates sophistication, trust, and exceptional care for luxury properties and discerning homeowners.

### Brand Essence
> *Elevated management for exceptional homes.*

**Tagline:** The home you love. The team you trust.

### Four Pillars
| Pillar | Description |
|--------|-------------|
| **Local Team** | Real people in your market |
| **Care** | Proactive home protection |
| **Transparency** | See everything, anytime |
| **Premium Rates** | Optimized performance |

---

## Two Systems: Print vs Digital

| Context | Primary Use | Font Pairing |
|---------|-------------|--------------|
| **Print (Packets)** | Luxury collateral, owner-facing | Libre Baskerville + Inter |
| **Digital (App/Web/Email)** | Internal tools, marketing, website | Inter (primary) + Libre Baskerville (headers) |

---

## Logo System

### Primary Logo
The logo consists of the pin icon + "LocalLuxe" wordmark + "COLLECTION" subtitle.

**Construction:**
- Pin icon in Luxe Gold (#C9A962) or White (on dark)
- "Local" in Warm Tan (#D4BDA2)
- "Luxe" in Charcoal (#2D2D2D) or White (on dark)
- "COLLECTION" in all-caps, letterspaced, Medium Gray (#636466)

### Logo Usage by Context
| Context | Logo Version | Background |
|---------|--------------|------------|
| Light background | Gray/Charcoal logo | White, cream |
| Dark background | White logo | Navy, brand gray |
| Favicon | Tan icon | N/A |
| Email header | White horizontal | Tan or navy bar |
| Print cover | White on photo | Photo with gradient |
| Print back cover | White | Navy #1A2744 |

### Usage Rules
- Maintain clear space equal to pin icon height on all sides
- Never stretch, distort, recolor, or add effects

---

## Color Palette

### Core Brand Colors
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Primary Tan** | `#D4BDA2` | 212, 189, 162 | CTAs, buttons, accents, highlights, stars |
| **Tan Light** | `#E8DCCF` | 232, 220, 207 | Hover states, subtle backgrounds |
| **Tan Dark** | `#B8A08A` | 184, 160, 138 | Section labels, stat numbers, active states |
| **Navy** | `#1A2744` | 26, 39, 68 | Dark backgrounds, footers, premium sections |
| **Gold** | `#C9A962` | 201, 169, 98 | Luxe tier highlights, special badges (sparingly) |
| **Brand Gray** | `#636466` | 99, 100, 102 | Sidebar, dark UI elements |

### Text Colors
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Charcoal** | `#2D2D2D` | 45, 45, 45 | Primary text, headlines |
| **Dark Gray** | `#4A4A4A` | 74, 74, 74 | Body copy |
| **Medium Gray** | `#6B6B6B` | 107, 107, 107 | Captions, subtitles |
| **Light Gray** | `#9A9A9A` | 154, 154, 154 | Tertiary text, footers |

### Background Colors
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Cream** | `#FAF9F7` | 250, 249, 247 | Page backgrounds (never pure white) |
| **White** | `#FFFFFF` | 255, 255, 255 | Cards, content areas |
| **Border** | `#E5E0DA` | 229, 224, 218 | Dividers, card borders |

### Status Colors
| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| Success | Emerald | `#059669` | Delivered, complete, positive |
| Warning | Amber | `#D97706` | In progress, attention needed |
| Error | Red | `#DC2626` | Failed, overdue, destructive |
| Info | Blue | `#2563EB` | Shipped, informational |
| Generated | Purple | `#9333EA` | Pending action, draft |

### Pricing Visual Colors (Print)
| Name | Hex | Usage |
|------|-----|-------|
| Optimized Green BG | `#d4e6d4` | Dynamic pricing blocks |
| Optimized Green Text | `#2d5a2d` | Dynamic pricing text |
| Stale Amber BG | `#fef3e3` | Flat rate blocks |
| Stale Amber Text | `#c4923a` | Flat rate text |

---

## Typography

### Font Stack
```css
--font-sans: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
--font-serif: "Libre Baskerville", Georgia, serif;
--font-mono: Menlo, Monaco, monospace;
```

### Google Fonts Import
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

### Type Scale — Digital (App/Web/Email)
| Element | Font | Weight | Size | Notes |
|---------|------|--------|------|-------|
| H1 Page Title | Libre Baskerville | 400 | 32-38px | Normal |
| H2 Section | Libre Baskerville | 400 | 24-28px | Normal |
| H3 Card Title | Inter | 600 | 16-18px | Normal |
| Body | Inter | 400 | 14-15px | line-height 1.6-1.7 |
| Small/Caption | Inter | 400-500 | 12-13px | Normal |
| Label | Inter | 600 | 10-11px | Uppercase, tracking 1-2px |
| Button | Inter | 500 | 14px | Normal |

### Type Scale — Print (Packets)
| Element | Font | Weight | Size | Style |
|---------|------|--------|------|-------|
| Cover Title | Libre Baskerville | 400 | 38px | Normal |
| Page Headline | Libre Baskerville | 400 | 32-34px | Normal |
| Subhead | Libre Baskerville | 400 | 15-17px | Italic |
| Body | Inter | 400 | 13-13.5px | line-height 1.7-1.85 |
| Section Label | Inter | 600 | 10px | Uppercase, tracking 1.5-2px |
| Footer | Inter | 400 | 9px | Normal |

### Section Labels
```css
.section-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #B8A08A;  /* tan-dark */
  margin-bottom: 8px;
}
```

---

## Spacing System

| Size | Value | Usage |
|------|-------|-------|
| xs | 4px | Icon padding, tight gaps |
| sm | 8px | Badge padding, tight spacing |
| md | 16px | Standard padding |
| lg | 24px | Card padding, section gaps |
| xl | 32px | Major section spacing |
| 2xl | 48px | Page sections |
| 3xl | 64-80px | Hero sections |

### Print Specifications
- **Page size:** 8.5" × 11"
- **Bleed:** 0.125" all edges
- **Safety margin:** 0.5" from trim
- **Binding:** Saddle-stitch (no spine)
- **Page padding:** 44-68px
- **Section spacing:** 28-32px

---

## Component Patterns

### Primary Button
```css
.btn-primary {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  background: #D4BDA2;
  color: #2D2D2D;
  padding: 12px 24px;
  border-radius: 4px;
  border: none;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #C9A962;
}
```

### Secondary Button
```css
.btn-secondary {
  background: transparent;
  color: #2D2D2D;
  border: 1px solid #E5E0DA;
  padding: 12px 24px;
  border-radius: 4px;
}
.btn-secondary:hover {
  background: #FAF9F7;
  border-color: #D4BDA2;
}
```

### Card
```css
.card {
  background: #FFFFFF;
  border: 1px solid #E5E0DA;
  border-radius: 6px;
  padding: 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}
```

### Stat Display
```css
.stat-display {
  background: #FAF9F7;
  border-radius: 6px;
  padding: 20px 28px;
  text-align: center;
}
.stat-number {
  font-family: 'Libre Baskerville', serif;
  font-size: 36px;
  color: #B8A08A;
}
.stat-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #6B6B6B;
}
```

### Status Badges
```css
/* Success */
background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;

/* Warning */  
background: #fffbeb; color: #d97706; border: 1px solid #fde68a;

/* Error */
background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;

/* Info */
background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;

/* Neutral */
background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb;
```

---

## Page Backgrounds

| Context | Background | Notes |
|---------|------------|-------|
| Default page | `#FAF9F7` (cream) | Never pure white |
| Cards/modals | `#FFFFFF` | Content containers |
| Dark sections | `#1A2744` (navy) | Footers, premium CTAs |
| Hero overlay | `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.1), rgba(0,0,0,0.55))` | Over photos |

---

## Hero Sections (Website)

```css
.hero {
  position: relative;
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 48px;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0.35) 0%,
    rgba(0,0,0,0.1) 40%,
    rgba(0,0,0,0.55) 100%
  );
}

.hero h1 {
  font-family: 'Libre Baskerville', serif;
  font-size: 48px;
  font-weight: 400;
  line-height: 1.3;
  text-shadow: 0 2px 12px rgba(0,0,0,0.4);
  color: white;
}

.hero p {
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.9);
}
```

---

## Email Template Structure

```
┌─────────────────────────────────────┐
│  HEADER: Navy or Tan background     │
│  Logo: White LocalLuxe              │
│  Height: 60-80px, Padding: 24px     │
├─────────────────────────────────────┤
│  BODY: Cream #FAF9F7 background     │
│  Content card: White #FFFFFF        │
│  Max-width: 600px                   │
│  Padding: 32px                      │
│                                     │
│  H1: Libre Baskerville 28px         │
│  Body: Inter 15px, line-height 1.7  │
│  Text: #2D2D2D                      │
│                                     │
│  CTA Button:                        │
│  - Background: #D4BDA2              │
│  - Text: #2D2D2D                    │
│  - Padding: 14px 28px               │
│  - Border-radius: 4px               │
├─────────────────────────────────────┤
│  FOOTER: Navy #1A2744               │
│  Text: rgba(255,255,255,0.7)        │
│  Font: Inter 12px                   │
└─────────────────────────────────────┘
```

---

## Ad Creative Guidelines

| Element | Specification |
|---------|---------------|
| Primary headline | Libre Baskerville 400, 28-36px |
| Subhead | Libre Baskerville italic, 16-18px |
| Body copy | Inter 400, 14-16px |
| CTA | Inter 500, 14px, tan button #D4BDA2 |
| Background | Property photo with gradient overlay, OR cream #FAF9F7 |
| Logo placement | Top or bottom, white on dark / gray on light |

---

## Tailwind Config

```javascript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        tan: {
          DEFAULT: '#D4BDA2',
          light: '#E8DCCF',
          dark: '#B8A08A',
        },
        navy: '#1A2744',
        charcoal: '#2D2D2D',
        cream: '#FAF9F7',
        border: '#E5E0DA',
        gold: '#C9A962',
        'brand-gray': '#636466',
        'dark-gray': '#4A4A4A',
        'medium-gray': '#6B6B6B',
        'light-gray': '#9A9A9A',
      },
      fontFamily: {
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
}
```

---

## CSS Variables

```css
:root {
  /* Primary */
  --tan: #D4BDA2;
  --tan-light: #E8DCCF;
  --tan-dark: #B8A08A;
  --navy: #1A2744;
  --gold: #C9A962;
  
  /* Text */
  --charcoal: #2D2D2D;
  --dark-gray: #4A4A4A;
  --medium-gray: #6B6B6B;
  --light-gray: #9A9A9A;
  --brand-gray: #636466;
  
  /* Backgrounds */
  --cream: #FAF9F7;
  --white: #FFFFFF;
  --border: #E5E0DA;
  
  /* Typography */
  --font-serif: 'Libre Baskerville', Georgia, serif;
  --font-sans: 'Inter', -apple-system, sans-serif;
}
```

---

## Design Principles

| ✓ DO | ✗ DON'T |
|------|---------|
| Use cream #FAF9F7 for page backgrounds | Use pure white #FFFFFF for page backgrounds |
| Serif headlines, sans body | Serif for body text |
| Tan accents sparingly (10-15% of UI) | Tan everywhere — it should feel special |
| Generous whitespace (32-48px sections) | Cramped layouts |
| Subtle shadows rgba(0,0,0,0.06) | Harsh drop shadows |
| 4-6px border radius | Sharp corners or overly rounded (12px+) |
| Dark text on light backgrounds | Light text on light backgrounds |
| Navy for premium/footer sections | Navy as a primary background |

### Key Theme
> Warm earth tones, editorial serif headlines, clean sans-serif body, generous whitespace, soft shadows.

---

## Quick Reference Summary

| Element | Print | Digital |
|---------|-------|---------|
| **Headlines** | Libre Baskerville 32-38px | Libre Baskerville 28-38px |
| **Body** | Inter 13-13.5px | Inter 14-15px |
| **Page BG** | White with cream elements | Cream #FAF9F7 |
| **Accent** | Tan #D4BDA2 | Tan #D4BDA2 |
| **Dark BG** | Navy #1A2744 | Navy #1A2744 |
| **Borders** | #E5E0DA | #E5E0DA |
| **Radius** | 6-8px | 4-6px |

---

*LocalLuxe Collection — Elevated management for exceptional homes.*
