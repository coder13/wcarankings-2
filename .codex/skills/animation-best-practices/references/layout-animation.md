# Layout Animation Reference

## Height-transfer model

For a list with normal row height `R` and expanded row height `E`, let `p` move from `0` to `1`:

```text
closing row = E + (R - E) * p
opening row = R + (E - R) * p
```

The sum remains `E + R`, so rows below the opening row do not move during a row-to-row transfer. With more than two interrupted rows, interpolate every currently animated key from its current size to its final target while preserving the total size budget.

## Virtualizer contract

Choose one of these contracts before coding:

### Measurement-driven

- Animate the real height of the measured DOM element.
- Do not set a competing explicit height or call `resizeItem` for that element.
- Confirm `ResizeObserver` updates the virtualizer on every meaningful height change.
- Use this when the animation library reliably changes layout dimensions frame by frame.

### Manual transition sizing

- Animate a shared progress value with Motion's `animate()` controller.
- Call `resizeItem` for every affected key from that one progress callback.
- Return the cached/manual size from `measureElement` while the key is locked.
- On completion, write exact target sizes, clear locks, and clear exiting keys.
- On interruption, stop the controller and retain current sizes as the next transition's starting point.

Do not mix these contracts for the same row. That was the source of transient lower-row movement in the WCA rankings accordion.

## Stable loading frame

Use one frame with two layers:

```text
stable content frame
  loaded content, opacity 0 -> 1
  skeleton overlay, opacity 1 -> 0
```

Give both states the same grid tracks and minimum height. Do not mount a short placeholder and later replace it with a taller result tree.

## Geometry assertions

For visible rows in a browser test:

```js
const boxes = await page.locator(".virtualRow").evaluateAll((nodes) =>
  nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  }),
);

const gaps = boxes.slice(1).map((box, index) => box.top - boxes[index].bottom);
const maxGap = Math.max(...gaps);
```

Allow only subpixel rounding noise. During a transfer from index `a` to `b`, record the `top` values below `Math.max(a, b)` at several animation times and assert they remain stable.
