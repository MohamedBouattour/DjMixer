## Brand & Style
The design system is engineered for a high-performance, dark-room environment typical of professional DJ booths. The brand personality is technical, high-energy, and precision-oriented, catering to professional artists who require immediate visual feedback in low-light settings.

The aesthetic leans heavily into **Glassmorphism** and **Vaporwave-influenced High-Contrast**. It utilizes deep obsidian surfaces layered with translucent glass panels that feature high-intensity neon accents. The visual language mimics high-end hardware controllers through the use of digital readouts and glowing state indicators, ensuring the interface feels like an instrument rather than just software.

## Layout & Spacing
This design system uses a **Fixed Grid** approach optimized for 16:9 widescreen displays, reflecting the standard layout of a DJ booth setup.

- **The Dashboard:** Divided into three primary zones. Top: Global Header/Clock. Middle: Dual Deck Playback. Bottom: Library Browser and Mixer.
- **Structure:** 12-column grid with narrow 12px gutters to maximize screen real estate for waveforms.
- **Density:** High density is preferred. Elements are packed tightly within panels to allow the DJ to see maximum information without scrolling.

## Elevation & Depth
Depth is achieved through **Backdrop Filtering** rather than traditional shadows.

1.  **Base Layer:** Solid dark neutral foundation.
2.  **Panel Layer:** Semi-transparent surfaces (`rgba(255, 255, 255, 0.03)`) with a `backdrop-filter: blur(12px)`.
3.  **Floating Modals:** Increased transparency (`rgba(255, 255, 255, 0.08)`) with a 1px solid border (`rgba(255, 255, 255, 0.2)`).
4.  **The Glow:** Active components do not rise in Z-space; instead, they emit an outer glow (`box-shadow: 0 0 15px [color]`).

## Components
- **Pill Buttons:** High-contrast background for active states. Default state is a ghost button with a subtle 1px border.
- **Circular Platters:** The "Vinyl" disc should feature a rotating center-label. The outer ring serves as a progress bar (Electric Blue for Deck A, Muted Steel for Deck B).
- **Faders & Sliders:** Vertical pitch faders use a "hollow track" design. The "thumb" or "cap" should have a central glow-line indicating the zero-point.
- **VU Meters:** Segmented LED bars. The segments should transition from dimmed grey to vibrant green, then orange, and finally red (clipping) at the top.
- **Waveforms:** High-frequency data shown in a dual-layer style: a solid core and a semi-transparent "glow" outer casing.
- **Deck Panels:** Contained in glassmorphic cards with a subtle top-light highlight (1px white stroke at 10% opacity) to simulate physical depth.
