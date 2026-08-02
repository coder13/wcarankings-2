# Rankings UI Animation Architecture
This document records the animation rules for the virtualized rankings table.
These rules are especially important for row accordions because the rendered
pane and the TanStack virtualizer must agree on one changing row height.

## Accordion ownership

The accordion pane in `RankingRow` is the only source of expansion and collapse
motion. Motion animates its height between `0` and `auto` over 200 ms with the
`[0.2, 0.7, 0.2, 1]` easing curve.

`ResultsTable` must not run a second height tween for the virtual row. Instead,
a `ResizeObserver` watches the natural `li` height and reports each measured
frame to the virtualizer through `resizeItem`. This keeps rows below the
accordion synchronized with the visible pane without constraining the pane's
contents.

Do not restore either of these patterns:

- A parallel Motion or JavaScript animation from a fixed collapsed height to a
  fixed expanded height.
- `height: 100%` on the expanded `.listItem` or `.row` while its virtual parent
  is changing height.

Both create competing geometry. The forced-height version makes CSS Grid
redistribute shrinking space, which moves the accordion's top edge and contents
instead of closing only its bottom edge. Fixed expanded heights also fail on
mobile when competition names, ranks, or solve lists wrap.

## Expansion and collapse state

When a user closes a row or opens a different row, add the outgoing key to
`closingKeys` in the same state update that changes the expanded key. The pane
must stay mounted until its own `onAnimationComplete` callback removes that
closing key.

Do not defer the initial closing state to an effect. Doing so lets
`AnimatePresence` begin an exit and then remounts the same pane as closing. This
previously caused the pane to overshoot in height and made its contents shift.
The effect remains useful as a fallback for externally driven focus changes,
but user interaction establishes closing state synchronously.

## Cached details and URL focus

The focused WCA ID is mirrored into the URL, so `initialExpandedPersonId` also
changes after ordinary row clicks. It is not, by itself, proof that an expansion
is the initial deep-linked row.

Capture the initial expansion key once. Consume that exemption on the first user
toggle. Every user-triggered expansion must animate from zero height, including
rows whose details were cached or prefetched.

Detail requests return parsed `PersonEventDetails`. Callers must not treat that
value as a `Response` or attempt to parse it again on the cached path.

## Loading geometry

The loading and loaded layers share the same CSS grid area and remain in normal
flow. Their label, value, rank, competition, solve, and footer placeholders
should approximate the corresponding loaded line heights, including mobile
wrapping.

Skeletons reduce the size change when data arrives, but they are not the source
of truth for expanded height. Content varies by competitor and viewport. The
`ResizeObserver` must reconcile the actual natural height before and after data
loads.

## Regression checks

Check cached and uncached rows on both mobile and desktop. Also switch directly
from one expanded row to another.

During each animation:

- The opening pane height increases through multiple intermediate values.
- The outgoing pane height decreases through multiple intermediate values and
  remains mounted until it reaches zero.
- A pane's top edge stays directly below its own row header.
- The content offset inside its pane remains constant. Only the pane's bottom
  edge should expand or collapse.
- The virtual row height and the following row position track the pane without
  overlap, blank space, or a late snap when cached data replaces a skeleton.
