---
name: Obsidian Audio & Video Chat
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#ff7a73'
  on-tertiary-container: '#79000e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-tablet: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
---

## Brand & Style

This design system establishes a high-performance, immersive communication environment tailored for real-time audio and video interaction. The brand personality is focused, sophisticated, and technologically razor-sharp, delivering an atmospheric studio feel that minimizes visual clutter and maximizes immersion during live conversations.

The aesthetic fuses modern dark-mode minimalism with tactical glassmorphism:
- Deep obsidian foundation layers create infinite visual depth, preventing screen burn-in and visual fatigue during prolonged sessions.
- Luminous status accents provide immediate, peripheral recognition of operational states (transmitting, muted, spatial presence).
- Translucent frosted glass layers (heavy backdrop blur with microscopic luminous border strokes) simulate hardware-level overlays, making active calls feel like head-up displays (HUDs).
- Fluid micro-interaction states ensure users maintain non-verbal situational awareness through pulsing voice waveforms, dynamic participant halos, and non-intrusive floating control panels.

## Colors

The palette is engineered specifically for deep-contrast low-light environments, prioritizing peripheral state awareness over heavy cosmetic decoration:

- **Surface Base (`#0B0F17`):** Obsidian void background, used for video stream cutouts, full-screen canvas backgrounds, and immersive root shells.
- **Surface Elevation 1 (`#131B2A`):** Deep navy-slate used for bottom sheets, navigation rails, and pinned toolbars.
- **Surface Elevation 2 (`#1E293B`):** Structural container background for inactive participant tiles, media controls, and message panels.
- **Primary / Live State (`#10B981`, accent `#34D399`):** Electric emerald and mint reserved exclusively for positive presence indicators, active microphone audio waveforms, live ping metrics, and active speaker rings.
- **Secondary / Audio Hub (`#6366F1`, accent `#818CF8`):** Vivid violet-indigo designated for voice stage rooms, screen-sharing indicators, interactive reactions, and premium capability badges.
- **Destructive / Alert (`#EF4444`, accent `#F87171`):** High-saturation coral red strictly reserved for call termination, destructive channel drops, and hardware-level mute states.
- **Text & Borders:** Text hierarchy relies on pure white (`#FFFFFF`) for active speakers and titles, slate gray (`#94A3B8`) for metadata/timecodes, and muted indigo (`#475569`) for disabled states. Borders consistently utilize `rgba(255, 255, 255, 0.08)` to form ethereal boundary definitions against dark video backdrops.

## Typography

The type system blends technical precision with ergonomic legibility:

- **Headlines (Space Grotesk):** Gives voice room titles, live participant counts, and modal headers a crisp, architectural finish. Its condensed proportions allow lengthy room names to fit within constrained top app bars.
- **Body & Content (Plus Jakarta Sans):** Balances human warmth with modern clarity for in-call live chat streams, participant names, and device settings. Rounded apertures maintain extreme legibility against moving video feeds.
- **Technical Readouts & Telemetry (JetBrains Mono):** Reserved for technical metrics including call duration timers, bitrate stats, packet loss data, audio frequency tags, and microphone decibel levels.
- **Contrast Guard:** Never render body or label typography below 60% opacity against pure black to ensure zero legibility drop-off under dynamic camera exposures.

## Layout & Spacing

The layout is built for fluid touch interactions and responsive viewports ranging from vertical mobile screens to horizontal multi-stream layouts:

- **Mobile First Framework:** Uses an edge-to-edge safe area layout model. Active video feeds consume full screen height, with controls suspended inside floating glass sheets positioned over safe area bottoms (`env(safe-area-inset-bottom) + space-lg`).
- **Participant Stream Reflow:**
  - *1-on-1:* Fullscreen dominant stream with secondary self-view docked into a draggable floating tile ($96 \times 144$px) spaced `space-lg` from the screen border.
  - *3–6 Participants:* Auto-balancing CSS grid layout with `space-sm` gaps, scaling tiles to keep faces centered without vertical scrolling.
  - *Stage Rooms (7+):* Dynamic focus layout allocating 65% height to active speaker/presenter and a horizontal-scrolling bottom shelf for listeners with `space-sm` item separation.
- **Docked Overlay Bounds:** All in-call controls (mic, camera, reactions, hang-up) stay contained within a unified pill shelf centered horizontally with a fixed maximum width of `380px` on mobile and tablet screens.

## Elevation & Depth

Visual hierarchy does not use drop shadows, which muddy dark interfaces. Depth is achieved via glassmorphic light transmission, background blur, and micro-luminance borders:

- **Level 0 (Void Canvas):** `#0B0F17` pure solid background for inactive camera frames and deep app foundations.
- **Level 1 (Sub-surface):** `#131B2A` with 0px blur. Used for chat drawers and sliding participant rosters.
- **Level 2 (Glass Overlay - Floating Panels):** Background color set to `rgba(19, 27, 42, 0.65)` layered with `backdrop-filter: blur(24px) saturate(180%)`. Border: `1px solid rgba(255, 255, 255, 0.08)`.
- **Level 3 (Interactive Controls & Badges):** Background set to `rgba(30, 41, 59, 0.85)` with `backdrop-filter: blur(16px)` and an inner highlight inset border `1px solid rgba(255, 255, 255, 0.12)`.
- **Live Speaker Glow (Luminescent Depth):** Active speakers receive a dynamic ring perimeter rather than a box shadow: `0 0 0 2px #10B981`, paired with a soft radiant halo: `0 0 24px rgba(16, 185, 129, 0.35)`.
- **Emergency / Disconnect Depth:** Active destructive nodes employ an inner glow: `0 0 16px rgba(239, 68, 68, 0.4)`.

## Shapes

The design system maintains a refined, modern curvature calibrated to `0.5rem` (`roundedness: 2`), keeping shapes technical and contemporary:

- **Standard Tiles & Sheets:** Video viewports, media preview panels, and drawer corners apply `rounded-xl` (`1.5rem` / `24px`) to create smooth borders that frame faces without clipping camera bounds.
- **Floating HUD Elements:** In-call control shelves, reaction docks, and message bubbles use `rounded-lg` (`1rem` / `16px`) with high internal corner symmetry.
- **Action Buttons & Avatar Rings:** Avatar containers and primary floating trigger buttons adopt complete capsule/circular geometry (`rounded-full` / `9999px`) to contrast against rectangular video feeds.
- **Micro Badges:** Network ping, mute badges, and room participant counts use standard `0.5rem` (`8px`) roundedness to maintain crisp geometry when housing monospaced technical figures.

## Components

### Action Controls & Floating Dock Buttons
- **Standard Call Toggle:** Circular $56 \times 56\text{px}$ button crafted from `rgba(30, 41, 59, 0.85)` with `rgba(255, 255, 255, 0.08)` border. Icon centered at $24\text{px}$, colored `#FFFFFF`.
- **Active State:** Toggles switch to `#10B981` solid background with pure white icon, generating an immediate visual toggle.
- **End Call Button:** High-priority circle ($56 \times 56\text{px}$) styled in `#EF4444` solid with coral radiant glow (`box-shadow: 0 4px 20px rgba(239, 68, 68, 0.45)`).

### Participant Video Tiles
- Enclosed with `rounded-xl` corners and `1px solid rgba(255, 255, 255, 0.06)`.
- Bottom-left corner embeds participant nameplate: a pill badge with frosted `rgba(11, 15, 23, 0.7)` backdrop, JetBrains Mono label, and a $6\text{px}$ emerald dot indicator for audio activity.
- Bottom-right corner nests hardware mute icon ($16\text{px}$) inside an `rgba(239, 68, 68, 0.2)` capsule if microphone is muted.

### Audio Waveform & Speaking Halos
- Micro-interaction audio indicator consisting of three vertical bars ($2\text{px}$ width) animating dynamically across heights $4\text{px}$ to $16\text{px}$ in `#34D399`.
- Surrounding video tile border transitions smoothly from `rgba(255, 255, 255, 0.08)` to `#10B981` in $150\text{ms}$ ease-out when volume input exceeds $-42\text{dBFS}$.

### Badges & Status Chips
- **Voice Stage Badge:** Violet tint overlay (`rgba(99, 102, 241, 0.15)`), border `rgba(99, 102, 241, 0.3)`, text `#818CF8`. Displays stage mode, screen sharing, or room encryption lock.
- **Live Connection Chip:** Obsidian capsule with monospaced text depicting network delay (e.g., `24ms`), prefixed by an emerald (`#10B981`) dot for ping $<50\text{ms}$ or coral (`#EF4444`) dot for packet loss $>2\%$.

### In-Call Live Chat Drawer & Inputs
- **Chat Drawer:** Extrudes from bottom or side using `#131B2A` with top surface border `rgba(255, 255, 255, 0.08)`.
- **Text Field:** Pill shape input with inner background `rgba(11, 15, 23, 0.8)`, border `1px solid rgba(255, 255, 255, 0.08)`, focus outline `1px solid #6366F1`.
- **Chat Bubbles:** Incoming messages use `#1E293B` with white body text; outgoing messages use `#6366F1` with white body text.