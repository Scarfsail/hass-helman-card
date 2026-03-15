# Forecast Card Consolidation Proposal

## Current State

### Three Separate Forecast Components

| Component | Shows | Location Today |
|-----------|-------|----------------|
| `helman-forecast-detail` | Solar production + Grid price | Solar dialog, Grid dialog, **helman-forecast-card** |
| `helman-battery-forecast-detail` | Battery SoC + Charge/Discharge | Battery dialog only |
| `helman-house-forecast-detail` | Baseline + Deferrable consumption | House dialog only |

Each component independently fetches the **same** `helman/get_forecast` WebSocket payload every 5 minutes.

### Color Conflict

The core problem: **green is overloaded**.

| Element | CSS | Resolved Color |
|---------|-----|----------------|
| Price positive (sell/export) | `var(--success-color, #2e7d32)` | Dark green |
| Battery charge movement | `var(--success-color, #2e7d32)` | Dark green (same!) |
| Battery SoC bars | `var(--simple-card-source-battery, #22c55e)` | Bright green |
| Price negative (buy/import) | `var(--error-color, #c62828)` | Red |
| Battery discharge movement | `var(--error-color, #c62828)` | Red (same!) |
| Price neutral | `var(--warning-color, #ef6c00)` | Orange |

When battery and price charts appear next to each other (which consolidation makes critical), green bars in the price row and green bars in the battery row are indistinguishable.

---

## Color Fix: Dedicated Price Palette

Decouple prices from semantic HA theme colors. Use a cool-toned scale with no overlap with energy source colors:

| Element | New Color | Hex |
|---------|-----------|-----|
| Price positive (sell) | Teal/Cyan | `#0891b2` (cyan-600) |
| Price negative (buy) | Violet/Purple | `#9333ea` (purple-600) |
| Price neutral | Slate blue | `#6366f1` (indigo-500) |

The entire warm spectrum (yellow=solar, green=battery, red=error) stays untouched. Prices get their own cool "financial" palette.

### Full Palette

```
Solar bars:           ████  #facc15  (yellow)         — unchanged
Battery SoC:          ████  #22c55e  (bright green)   — unchanged
Battery charge:       ████  #2e7d32  (dark green)     — unchanged
Battery discharge:    ████  #c62828  (red)             — unchanged
Price positive:       ████  #0891b2  (teal/cyan)      — NEW
Price negative:       ████  #9333ea  (purple)          — NEW
Price neutral:        ████  #6366f1  (indigo)          — NEW
House baseline:       ████  var(--primary-color)       — unchanged
House deferrable:     ████  var(--secondary-text-color) — unchanged
```

### CSS Changes

File: `src/helman-simple/node-detail/node-detail-shared-styles.ts`

```css
/* Before: */
.price-positive { color: var(--success-color, #2e7d32); }
.price-negative { color: var(--error-color, #c62828); }
.price-neutral  { color: var(--warning-color, #ef6c00); }

/* After: */
.price-positive { color: var(--forecast-price-positive, #0891b2); }
.price-negative { color: var(--forecast-price-negative, #9333ea); }
.price-neutral  { color: var(--forecast-price-neutral, #6366f1); }
```

Dedicated CSS custom properties allow theme override while providing distinct defaults.

---

## Layout: Unified Day Cards with Gauges

One set of day cards, each showing **all forecast types** via colored gauge bars + mini-chart strips. Clicking a day expands a detail panel with all hourly chart rows on a shared time axis.

### Gauge Rules

| Forecast | Gauge Fill Logic | Color |
|----------|-----------------|-------|
| Solar | `solarKwh / max(solarKwh across all days)` | `--simple-card-source-solar` (yellow) |
| Battery | `endSocPct / 100` (always absolute 0-100%) | `--simple-card-source-battery` (green) |
| House | `baselineKwh / max(baselineKwh across all days)` | `--primary-color` |

Price has no gauge — it uses min/max chips (same as current solar/grid forecast).

Today's solar gauge shows two layers: a muted fill for total (including past hours) and a bright fill for remaining — same pattern as the current `helman-forecast-detail`.

### Day Card Overview

```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ Today              + │  │ Tomorrow           + │  │ Wed 19.3           + │
│                      │  │                      │  │                      │
│ ██████░░░░ 4.2 kWh  │  │ ████████░░ 5.1 kWh  │  │ ████░░░░░░ 2.8 kWh  │
│ ▁▃▅▇▅▃▁             │  │ ▁▃▆█▆▃▁             │  │ ▁▂▃▃▂▁              │
│                      │  │                      │  │                      │
│ █████████░ 72%      │  │ ██████████ 85%       │  │ █████░░░░░ 45%      │
│ 30 – 95 %           │  │ 40 – 90 %           │  │ 25 – 80 %           │
│ ▃▅█▇▅▃▂             │  │ ▂▃▅▇█▅▃             │  │ ▅▃▂▁▂▃▅             │
│                      │  │                      │  │                      │
│ █████████░ 12.4 kWh │  │ ████████░░ 11.8 kWh │  │ ██████████ 13.1 kWh │
│  Def 3.2 kWh        │  │  Def 2.9 kWh        │  │  Def 4.1 kWh        │
│ ▃▅▇█▇▅▃             │  │ ▃▅▆▇▆▅▃             │  │ ▃▅▇█▇▅▃             │
│                      │  │                      │  │                      │
│ +1.2 ● min -0.3 ●  │  │ +0.8 ● min +0.1 ●  │  │ -0.3 ● min -0.5 ●  │
│ ▃▅▃▂▁▂▃             │  │ ▂▃▅▃▂▁▂             │  │ ▃▂▁▁▂▃              │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘

LEGEND (gauge fills are colored, not shown in ASCII):
  ██ = gauge fill (colored: yellow/green/primary)
  ░░ = gauge empty space
  ▁▃▅▇ = mini-chart bars
```

Each day card contains four sections top-to-bottom:

| Section | Content |
|---------|---------|
| **Solar** | Yellow gauge (relative to max day), kWh value overlaid, solar mini-chart below |
| **Battery** | Green gauge (absolute 0-100%), SoC % overlaid, min-max range line, SoC mini-chart below |
| **House** | Primary-color gauge (relative to max day), kWh value overlaid, deferrable secondary line, house mini-chart below |
| **Price** | Current/min/max price chips (colored by tone), price mini-chart below |

### Day Card — Handling Missing Forecasts

Not all forecast types may be available. Sections for unavailable forecasts are hidden entirely:

```
┌──────────────────────┐     ┌──────────────────────┐
│ Today              + │     │ Today              + │
│                      │     │                      │
│ ██████░░░░ 4.2 kWh  │     │ ██████░░░░ 4.2 kWh  │
│ ▁▃▅▇▅▃▁             │     │ ▁▃▅▇▅▃▁             │
│                      │     │                      │
│ █████████░ 72%      │     │ +1.2 ● min -0.3 ●  │
│ 30 – 95 %           │     │ ▃▅▃▂▁▂▃             │
│ ▃▅█▇▅▃▂             │     └──────────────────────┘
│                      │
│ █████████░ 12.4 kWh │       (no battery, no house)
│  Def 3.2 kWh        │
│ ▃▅▇█▇▅▃             │
│                      │
│ +1.2 ● min -0.3 ●  │
│ ▃▅▃▂▁▂▃             │
└──────────────────────┘
    (all available)
```

### Detail Panel (Expanded Day)

Clicking a day card expands a detail panel below the day grid. All chart rows share the same time axis.

```
┌──────────────────────────────────────────────────────────────────┐
│ Today — Hourly Detail                                            │
│                                                                  │
│ ☀ 4.2 kWh     🔋 30–95%     🏠 12.4 kWh     $ +1.2 / -0.3     │
│                                                                  │
│ Solar     │ ▁▃▅▆▇██▇▆▅▃▂▁                                │      │
│           │                                                │      │
│ Price     │       ▃▅▃▂▁▁▁▂▃▅▆▃▂▁▁▁▂▃▅▃▂▁                │      │
│           │                                                │      │
│ SoC       │ ─▃▅▇█──────────▇▅▃▂▁▃▅▇──                    │      │
│           │ - - - - - - - - - - - - - - - min 15%         │      │
│           │ - - - - - - - - - - - - - - - max 95%         │      │
│           │                                                │      │
│ Chg/Dis   │ ▃▅▇                              ▃▅▇          │      │
│           │          ▂▃▅▃▂▁▂▃▅▃▂                          │      │
│           │                                                │      │
│ House     │    ▃▅▆▇▆▅▃▄▅▆▇█▇▆▅▃▃▄▅▆▅▃▂▁                 │      │
│           │    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  (bands)       │      │
│           │                                                │      │
│           │ 0      6      12      18      24               │      │
└──────────────────────────────────────────────────────────────────┘
```

Detail chart rows:

| Row | Type | Description |
|-----|------|-------------|
| **Solar** | Bar chart | Yellow bars, peak highlight (↑), same as current |
| **Price** | Bidirectional bars | Teal/purple bars (new colors), min/max highlights, center baseline when negative prices exist |
| **SoC** | Step-line | Battery SoC step/dot/change segments, min/max SoC dashed reference lines, hit-min/hit-max coloring |
| **Chg/Dis** | Bidirectional bars | Green up (charge) / red down (discharge), center baseline |
| **House** | Bar chart + bands | Primary-color bars, upper/lower uncertainty bands, peak/trough highlights |

Below the house row, the **deferrable breakdown** section appears if deferrable consumers exist (same as current house forecast detail — per-consumer chart rows with cycling opacity).

### Detail Panel — Summary Header

The summary header adapts to which forecasts are available. Only available forecasts show a summary chip:

```
Full:     ☀ 4.2 kWh     🔋 30–95%     🏠 12.4 kWh     $ +1.2 / -0.3
Partial:  ☀ 4.2 kWh     $ +1.2 / -0.3
```

---

## Architecture

### Single Data Fetch

The `helman-forecast-card` loads the `ForecastPayload` once and passes the relevant sub-payloads as properties. No child component fetches independently.

```
helman-forecast-card
  │
  ├── loadForecast(hass) ← single WS call
  ├── setInterval(refreshForecast, 5 min)
  │
  └── <helman-unified-forecast-detail>
        ├── .solarForecast=${payload.solar}
        ├── .gridForecast=${payload.grid}
        ├── .batteryForecast=${payload.battery_capacity}
        ├── .houseForecast=${payload.house_consumption}
        ├── .hass=${hass}
        └── .localize=${localize}
```

### Model Pipeline

```
ForecastPayload
  │
  ├─ buildForecastDetailModel(solar, grid)  → ForecastDetailDayModel[]
  ├─ buildBatteryCapacityForecastModel(battery) → BatteryCapacityForecastDay[]
  ├─ buildHouseForecastModel(house)         → HouseForecastDay[]
  │
  └─ merge by dayKey → UnifiedForecastDay[]
       │
       ├── overview: gauge values + mini-chart models
       └── detail: all chart row models (shared column count from union of timestamps)
```

Existing model builders (`buildForecastDetailModel`, `buildBatteryCapacityForecastModel`, `buildHouseForecastModel`) are reused as-is. The new unified component merges their outputs by `dayKey` and computes cross-day gauge maximums.

### Gauge Computation (Cross-Day)

```typescript
// Solar gauge: relative fill
const maxSolarKwh = Math.max(...days.map(d => d.solar?.solarSummaryKwh ?? 0));
const solarFillPercent = (day.solar?.solarSummaryKwh ?? 0) / maxSolarKwh * 100;

// Battery gauge: absolute fill (0-100%)
const batteryFillPercent = day.battery?.endSocPct ?? 0;

// House gauge: relative fill
const maxHouseKwh = Math.max(...days.map(d => d.house?.baselineDayKwh ?? 0));
const houseFillPercent = (day.house?.baselineDayKwh ?? 0) / maxHouseKwh * 100;
```

### Day Alignment

Days are aligned by `dayKey` (YYYY-MM-DD). If one forecast has more days than another, the day card still appears — sections for missing data are simply omitted. For example, if battery covers 2 days but solar covers 3, the third day card has solar/house/price but no battery section.

---

## What Changes in Existing Components

| Component | Change |
|-----------|--------|
| `helman-forecast-card.ts` | Major rewrite — manages single fetch, renders unified detail component |
| `node-detail-shared-styles.ts` | Price color variables changed (affects all consumers) |
| `helman-forecast-detail.ts` | Stays as-is for solar/grid dialog use. No changes. |
| `helman-battery-forecast-detail.ts` | Stays as-is for battery dialog use. No changes. |
| `helman-house-forecast-detail.ts` | Stays as-is for house dialog use. No changes. |
| Model builders | Reused unchanged by the new unified component |

### New Files

| File | Purpose |
|------|---------|
| `helman-unified-forecast-detail.ts` | New LitElement component — day cards with gauges + mini-charts, detail panel with all chart rows |
| `unified-forecast-model.ts` | Merges per-type day models into `UnifiedForecastDay[]`, computes cross-day gauge maxes |

---

## Implementation Phases

**Phase 1: Color fix** — Change price color variables in `node-detail-shared-styles.ts`. Standalone change, immediately benefits existing dialogs.

**Phase 2: Unified model** — Build `unified-forecast-model.ts` that merges existing model outputs by dayKey and computes gauge fills.

**Phase 3: Unified component** — Build `helman-unified-forecast-detail.ts` with day cards (gauges + mini-charts) and detail panel (all chart rows).

**Phase 4: Card integration** — Update `helman-forecast-card.ts` to use single fetch + unified component.
