---
name: animation-best-practices
description: Design, implement, debug, and verify smooth UI animations, especially expandable rows, accordions, virtualized lists, loading transitions, and rapidly interruptible interactions. Use when animation causes layout shifts, gaps, stale measurements, flashing, overlap, or inconsistent movement between related elements.
---

# Animation Best Practices

Use this skill when a UI animation changes layout, pushes sibling content, depends on asynchronous data, or must survive rapid interaction.

## Workflow

1. Identify the layout boundary.
   - Determine which element controls the space occupied by the animation.
   - Animate that element's real box size when siblings must move.
   - Use transforms only for purely visual movement that must not affect layout.

2. Choose one sizing authority.
   - Prefer a single measurement path: let the layout engine or virtualizer measure the animated DOM.
   - If measurement is too asynchronous for coordinated movement, use manual sizing during the animation and explicitly lock measurement for the affected elements.
   - Never let `ResizeObserver` measurement and `resizeItem` independently overwrite the same row during one transition.

3. Define the animation state before rendering.
   - Resolve initial URL, focus, or selected state before the first visible layout where possible.
   - Do not animate initial hydration or deep-link expansion as if it were a user click.
   - Render a stable skeleton immediately when data is pending.

4. Coordinate related elements.
   - Use one progress value for rows that open and close together.
   - Preserve the total layout height when transferring expansion from one sibling to another; this keeps content below the lower affected row stationary.
   - Keep exiting content mounted with `AnimatePresence` or an equivalent presence mechanism.

5. Make interruption first-class.
   - Stop the active animation when a new interaction arrives.
   - Capture each affected element's current visual size and use it as the next animation's starting value.
   - Do not rely on fixed cleanup timeouts to restore layout state. Complete and cancel through the animation controller.

6. Separate content and geometry transitions.
   - Keep skeleton and loaded content in the same layout frame.
   - Fade loaded text into stable slots instead of replacing a differently sized subtree.
   - Keep the row's height animation independent from opacity and color transitions.

7. Apply visual states to the same boundary as geometry.
   - Hover, focus, selected, and expanded backgrounds should cover the full animated/virtualized slot.
   - Do not attach hover styling only to a short header when the row includes an expanded body.

## Preferred Motion Pattern

Use `motion/react` for visual transitions:

```tsx
<AnimatePresence initial={false} mode="sync">
  {visible && (
    <motion.div
      initial={skipInitial ? false : { height: 0, opacity: 0 }}
      animate={closing
        ? { height: 0, opacity: 0 }
        : { height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ height: { duration: 0.4 }, opacity: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

For virtualized rows, either allow the virtualizer to measure this element throughout the transition, or drive all affected row sizes from one Motion `animate()` progress value and lock measurement until completion. Do not combine both without an explicit lock.

## Failure Modes

- CSS keyframes plus a separate `requestAnimationFrame` size loop: two clocks disagree and leave stale heights.
- Independent open and close animations: `ResizeObserver` reports one row before the other, moving unrelated rows temporarily.
- Fixed timeout cleanup: interrupted transitions finish out of order and restore the wrong row.
- Animating only `transform`: siblings do not receive the new layout size.
- Replacing the skeleton DOM with loaded content: the browser recalculates geometry and flashes or shifts.
- Hydrating focus in a post-paint effect: the collapsed list paints before the focused row expands.
- Applying hover to an inner header: the accordion body and bottom edge appear outside the hover surface.
- Hard-coded expanded heights that do not include padding, margins, minimum heights, or footer spacing: visible gaps or overlap occur.

## Verification

Test the actual interaction, not only the final screenshot:

- Click several rows rapidly, including switching before the first animation completes.
- Switch between rows separated by other rows and confirm the rows below the lower affected row keep the same `top` position.
- Toggle open and closed repeatedly.
- Hard-refresh a focused URL and verify no initial expansion flash.
- Test a mobile viewport and both loading and loaded details.
- Measure every visible row's `top`, `bottom`, and `height` during the transition.
- Assert adjacent rows have no positive gap and no overlap beyond rounding noise.
- Confirm exactly one row remains expanded after rapid interaction.
- Honor `prefers-reduced-motion` where the product supports it.

For a detailed implementation checklist and geometry formulas, read [references/layout-animation.md](references/layout-animation.md).
