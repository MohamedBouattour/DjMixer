# Coding Guidelines & Standards

## Design Philosophy
- **Aesthetics**: "Glassmorphism" is the core design language. Use semi-transparent backgrounds, blur effects (`backdrop-filter: blur()`), and subtle borders to create depth.
- **Color Palette**: Dark mode by default. Key colors should be vibrant neon accents (green/blue/purple) against dark glass surfaces.
- **Responsiveness**: Primary targets are **Desktop** and **Tablet Landscape**. Mobile (Phone Portrait) is secondary but should not break.

## CSS / Styling
- **Methodology**: Use standard CSS files imported in components.
- **Naming**: BEM-ish or descriptive class names (e.g., `deck-container`, `mixer-knob`).
- **Variables**: Use CSS variables for colors and dimensions (define in `index.css`).
- **Avoid**: TailwindCSS (unless explicitly requested).

## TypeScript / React
- **Components**: Functional components with strict typing.
- **Props**: Define `interface` for props.
- **State**: Use `useState` for UI state, `useRef` for mutable values that don't trigger re-renders (like AudioContext nodes or animation IDs).
- **Hooks**: Custom hooks for complex logic (e.g., `useAudio`, `useDeck`).

## Project Structure
- `src/components/`: Reusable UI components.
- `src/hooks/`: Custom React hooks.
- `src/utils/`: Helper functions (formatters, math).
- `src/types/`: Shared TypeScript interfaces.
- `src/assets/`: Static modifications (images, svg).

## Common Patterns
- **Audio Handling**: always ensure AudioContext is resumed on user interaction.
- **Error Handling**: Gracefully handle stream failures (403 errors from backend) by showing a toast or retry button.
