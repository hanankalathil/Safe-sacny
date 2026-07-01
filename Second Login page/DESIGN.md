---
name: Vibrant Social
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#494831'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#7a785f'
  outline-variant: '#cac8aa'
  surface-tint: '#636100'
  primary: '#636100'
  on-primary: '#ffffff'
  primary-container: '#fffc00'
  on-primary-container: '#747300'
  inverse-primary: '#cfcc00'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#00a8fe'
  on-secondary-container: '#003a5c'
  tertiary: '#316766'
  on-tertiary: '#ffffff'
  tertiary-container: '#c8fffe'
  on-tertiary-container: '#447878'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ece900'
  primary-fixed-dim: '#cfcc00'
  on-primary-fixed: '#1d1d00'
  on-primary-fixed-variant: '#4a4900'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#94ccff'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#004b74'
  tertiary-fixed: '#b6edec'
  tertiary-fixed-dim: '#9bd0cf'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#154f4e'
  background: '#fcf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e1'
  background-subtle: '#F8F9FB'
  pure-white: '#FFFFFF'
  pure-black: '#000000'
typography:
  headline-lg:
    fontFamily: metrophobic
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: metrophobic
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: metrophobic
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: beVietnamPro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: beVietnamPro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: beVietnamPro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: beVietnamPro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  gutter: 16px
  margin-mobile: 24px
  margin-desktop: auto
  max-width-form: 400px
---

## Brand & Style

The design system is built around a high-energy, youth-centric aesthetic that prioritizes clarity, speed, and approachability. The brand personality is playful yet functional, evoking a sense of modern digital communication. 

The chosen design style is **Corporate / Modern** with a strong infusion of **High-Contrast / Bold** elements. It utilizes generous whitespace and a restricted but punchy color palette to drive focus toward user actions. The interface relies on crisp, high-contrast text against clean surfaces, accented by a signature vibrant brand color that commands attention.

## Colors

The palette is anchored by a high-visibility primary yellow, designed for immediate brand recognition. To maintain accessibility and readability, this primary yellow is used primarily for large brand surfaces or high-level containers, while the secondary blue is reserved for secondary actions or links.

The neutral system uses a deep charcoal (`#262626`) for primary text to avoid the harshness of pure black while maintaining maximum contrast. A very light gray (`#F8F9FB`) is utilized for background transitions and input field fills to create a soft distinction from the pure white page background.

## Typography

This design system utilizes a dual-font strategy to balance structure with friendliness. **Metrophobic** is used for headlines to provide a clean, geometric, and modern feel that echoes the "Avenir Next" aesthetic found in the reference material. **Be Vietnam Pro** is used for body text and labels to maintain an approachable, contemporary tone that is highly legible at small sizes.

Headlines should always be set with tighter tracking to feel cohesive. Body text uses standard leading to ensure comfortable reading during multi-step processes like sign-ups or onboarding.

## Layout & Spacing

The layout philosophy follows a **fixed-width container** approach for authentication and focused tasks, centering the content on the screen to minimize eye travel. On desktop, content is housed in a defined card or central column with a maximum width of 400px.

On mobile, the layout switches to a fluid model with 24px side margins. The spacing rhythm is based on a strict 8px grid. Vertical spacing between logical groups (like an input field and its label) should be 8px, while spacing between unrelated sections should be 24px or 32px to create clear visual "breathing room."

## Elevation & Depth

This design system uses a **low-contrast outline** and **tonal layer** approach rather than heavy shadows. Depth is communicated through subtle shifts in background color (e.g., placing a white card on a `#F8F9FB` background).

Interactions are signaled through color changes rather than elevation. For example, a button might darken slightly on hover, but it does not "lift" off the page. This keeps the interface feeling fast and flat. If a shadow is required for a floating element (like a modal), use a very soft, highly diffused neutral shadow: `0 4px 12px rgba(0, 0, 0, 0.05)`.

## Shapes

The shape language is defined by **Pill-shaped** geometry. This high level of roundedness is a core brand identifier, making the UI feel friendly and non-threatening. 

All primary buttons and text inputs should use the maximum radius to create the signature "pill" look. Smaller components like checkboxes or tags should follow suit, maintaining at least a 1rem radius to ensure consistency across the design system.

## Components

### Buttons
Primary buttons use the signature Yellow background with black text. They must be pill-shaped and span the full width of their container in mobile views. Secondary buttons should use a light gray fill or a simple text link style in the secondary blue color.

### Input Fields
Inputs are characterized by a light gray background (`#F8F9FB`) and a pill-shaped border. Labels sit outside the input field in a bold weight to ensure clarity. Focus states should be indicated by a subtle 2px border in the secondary blue or neutral charcoal.

### Chips & Tags
Used for selection or status, these should be small, pill-shaped, and use a background color that provides enough contrast for the text, typically a light version of the secondary blue or a neutral gray.

### Cards
Cards are white with no borders and very soft, minimal shadows. They are used to group form elements together against the subtle gray page background, creating a focused "surface" for user interaction.

### Checkboxes & Radios
These should be oversized and clearly interactive. Checkboxes should have slightly rounded corners (even within this pill-shaped system) to remain recognizable, while radios remain perfect circles.