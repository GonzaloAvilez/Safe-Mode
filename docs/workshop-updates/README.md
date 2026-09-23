# Workshop update archive

These dated notes record decisions and observations at the time they were written.
Their original copy, routes, thresholds and “next steps” are historical evidence,
not the current implementation checklist.

For current status, use [ROADMAP.md](../../ROADMAP.md),
[the screens map](../screens-map.md) and [ADR-003](../decisions/ADR-003-bilingual-routing-and-matching.md).
As of the 2026-09-22 reconciliation:

- Public routes use `/en/*` and `/es/*`; old unprefixed route names in these notes
  describe the earlier experience or serve as screen-name shorthand.
- Matching thresholds are stored per language. English 0.40 and Spanish 0.50 are
  migration defaults; historical calibration notes are not a live settings read.
- The cold-arrival introduction has shipped and is bilingual. Whether it resolves
  confusion for new visitors remains a product-validation question.
- Resonance and connection intent are separate controls. Public resonance counts
  appear in Observe, not Mirror.
- Narrative classification can include seed and user phrases and uses the stored
  language. It remains an optional, admin-triggered experiment.

The archive is preserved rather than rewritten to imply that later decisions were
already known at the time.
