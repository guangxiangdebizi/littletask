# LittleTask Design System

## Theme

The interface is a **verification desk**: a calm workspace where evidence moves visibly into an action. It should feel native to iOS without becoming anonymous. The signature element is an evidence rail that connects a quoted source fragment to the fields and confirmation control it produced.

No gradients, decorative grids, glass-card stacks, oversized rounding, or purple AI styling.

## Color

| Token       | Value     | Use                                |
| ----------- | --------- | ---------------------------------- |
| `canvas`    | `#F2F6F3` | App background                     |
| `surface`   | `#FFFFFF` | Primary working surfaces           |
| `ink`       | `#15221B` | Primary text and strong controls   |
| `muted`     | `#5D6B63` | Secondary text                     |
| `line`      | `#D7DFDA` | Dividers and quiet borders         |
| `pine`      | `#176348` | Primary action and confirmed state |
| `pineSoft`  | `#DCEDE5` | Evidence and success surfaces      |
| `amber`     | `#986016` | Assumptions and attention          |
| `amberSoft` | `#FFF1D2` | Assumption background              |
| `blue`      | `#315F87` | Calendar actions                   |
| `coral`     | `#A84F3E` | Failure and destructive actions    |

Status must always include text or an icon; color never carries meaning alone.

## Typography

- Display and body: the platform system family, allowing SF Pro on iOS.
- Evidence/source labels: system monospaced utility face where available.
- Page title: 34/40, weight 700.
- Section title: 20/26, weight 700.
- Card title: 17/22, weight 700.
- Body: 15/22, weight 400-500.
- Utility: 12/16, weight 600.

The type scale remains compact. Long Chinese labels must wrap without truncating decisive information.

## Layout

- Mobile: one continuous vertical workflow with 20-point side gutters.
- Wide Web acceptance view: intake remains on the left and results appear on the right, with a maximum content width of 1120 points.
- Spacing follows a 4-point base scale: 4, 8, 12, 16, 20, 24, 32, 40.
- Cards use 12-14 point corner radii; controls use 10-12; pills are reserved for compact status.
- Avoid shadows where a border or background change establishes hierarchy.

## Signature: Evidence Rail

Every Action Card begins with a narrow vertical rail, source label, and short quote. The rail color follows action type, but the quote remains readable without color. The action payload sits directly below it, making the inference path scannable in one direction.

## Components

- `Screen`: safe area, canvas, readable max width.
- `BrandMark`: compact wordmark plus a two-state confirmation glyph.
- `PrivacyStrip`: states that the original image is not retained.
- `ScreenshotPicker`: real selected-image preview and clear replacement action.
- `AnalysisProgress`: queued, understanding, review, and ready states.
- `ActionCard`: source evidence, payload, assumptions, state, confirm action.
- `StatusPill`: semantic icon and text.
- `InsightRow`: priority, evidence-backed recommendation, no decorative icon tile.

## Motion

Use motion only for state continuity: card insertion, confirmation state, and progress transitions. Durations stay between 160-240 ms and respect reduced motion. No ambient floating, looping glow, or choreographed delay that blocks task completion.

## Responsive and Native Behavior

- iOS owns contact/calendar permission dialogs and final mutations.
- Web clearly labels local mutations as simulated acceptance behavior.
- Keyboard focus is visible on Web.
- Touch targets remain at least 44 points.
- Loading, permission denied, network failure, empty analysis, stale revision, and execution failure all receive explicit recovery copy.
