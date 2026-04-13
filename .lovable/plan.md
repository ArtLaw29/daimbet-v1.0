

## Problem: Black screen when clicking "Gouvernement"

The issue is with the Radix UI `<SelectItem value="">` components (lines 301, 335). Radix Select does **not** support empty string `""` as a value — it causes the component to crash silently, resulting in a black screen with no error boundary to recover from.

This appears at:
- Line 301: `<SelectItem value="">— Aucun —</SelectItem>` (fixed ministries)
- Line 335: `<SelectItem value="">— Aucun —</SelectItem>` (custom ministries)

## Fix

1. **Replace empty string values** with a sentinel like `"__none__"` for the "— Aucun —" option in all `<SelectItem>` components.
2. **Update the `onValueChange` handlers** to convert `"__none__"` back to `""` when storing in state, so the rest of the logic (validation, submission) remains unchanged.

This is a 2-line pattern change in `GouvernementPage.tsx` — no other files affected.

