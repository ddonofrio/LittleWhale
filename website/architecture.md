# Architecture

Little Whale keeps the generic runtime and web chat stack as
replaceable upstream packages. Product behavior is applied through a final
Cordis composition overlay and a small Little Whale branding plugin.

The ownership boundary is recorded in `upstream/manifest.yml`. Mirror packages
are synchronized by snapshot; adapted packages preserve bootstrap behavior and
are reported for focused reconciliation.
