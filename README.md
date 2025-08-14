# Helman Card — House Electricity Manager Card

A Home Assistant Lovelace custom card to visualize and control household electricity flows. It shows real-time power for sources (solar, battery, grid) and consumers (house, devices), with animated flow indicators and compact history bars. It can group house devices by Home Assistant Labels and surface custom label badges per device.

- Live power and per-bucket history bars (configurable buckets and duration)
- Sources vs Consumers layout with animated flow arrows scaled by max power
- House device tree built from Energy device consumption prefs (with “Unmeasured power”)
- Entity disambiguation via HA Labels for power sensor and power switch selection
- Group devices by label categories (e.g., Location, Type) with emojis/text
- Optional aggregate info for Solar (today + forecast), Grid (import/export), and Battery (charge/empty ETA)


## Installation

You can install via HACS (as a custom repository) or manually.

### HACS (custom repository)
1. In Home Assistant, open HACS → Integrations → … menu → Custom repositories.
2. Add this repository URL and select category “Lovelace”.
3. Install “House Electricity Manager Card”.
4. Add a Lovelace resource (if not auto-added):
  - URL: /hacsfiles/hass-helman-card/helman-card-prod.js
   - Type: JavaScript Module

### Manual installation
1. Download the built file from Releases: `helman-card-prod.js`.
2. Copy it to your HA config under `www/helman-card/helman-card-prod.js`.
3. Add a Lovelace resource:
   - URL: /local/helman-card/helman-card-prod.js
   - Type: JavaScript Module


## Quick start (minimal card)
```yaml
type: custom:helman-card
power_devices:
  house:
    entities:
      power: sensor.house_power
  grid:
    entities:
      power: sensor.grid_power
  solar:
    entities:
      power: sensor.solar_power
  battery:
    entities:
      power: sensor.battery_power
```

This renders sources and consumers panels plus the house subtree from Energy prefs.


## Configuration reference

Top-level schema is `HelmanCardConfig`. Only `power_devices` is required; everything else is optional.

### Top-level options
- `type`: string — Must be `custom:helman-card`.
- `sources_title`: string — Title for the sources panel. Default: “Energy Sources”.
- `consumers_title`: string — Title for the consumers panel. Default: “Energy Consumers”.
- `groups_title`: string — Title preceding grouping chips. Default: “Group by”.
- `max_power`: number — Scaling reference (W) for animated flow arrows. If omitted, defaults to a 3-phase 25A system: `25 * 230 * 3`.
- `history_buckets`: number — Number of history samples to keep/render. Default: 60.
- `history_bucket_duration`: number — Duration of each bucket in seconds (also the live update interval). Default: 1.
- `power_sensor_name_cleaner_regex`: string — JavaScript regex (no slashes, global flag is applied) used to clean device names derived from sensors, e.g. to remove suffixes. Example: `" - [Pp]ower$"` or `"^[A-Z]{2}-"`.
- `device_label_text`: object — Mapping to enable label grouping and per-device badges. See “Grouping by labels”.
- `show_empty_groups`: boolean — If true, show label groups even when empty. Default: false.
- `show_others_group`: boolean — If true, show an “Others” group with unmatched devices. Default: true.
- `others_group_label`: string — Custom label for the Others group. Default: “Others”.

### `power_devices`
Defines entities for the four power endpoints. At least `house.entities.power` should be provided to build the consumer tree around the house.

Common optional fields (house tree disambiguation):
- `source_name`: string — Optional display override for the source device name.
- `consumption_name`: string — Optional display override for the consumer device name.
- `power_sensor_label`: string — Label name used to select the correct power sensor when a device exposes multiple power entities.
- `power_switch_label`: string — Label name used to select the matching switch entity for control.

Note: `power_sensor_label` and `power_switch_label` are only applied when building the house devices from Energy preferences. They do not affect the explicitly configured source tiles (grid/solar/battery).

Note: Label names must match HA Labels exactly (see Settings → Automations & Scenes → Labels). The card resolves label IDs internally.

#### HouseDeviceConfig (`power_devices.house`)
- `unmeasured_power_title`: string — Name for the synthetic “unmeasured” child node.
- `entities`:
  - `power`: sensor entity_id — Total house power.

#### GridDeviceConfig (`power_devices.grid`)
- `entities`:
  - `power`: sensor entity_id — Grid power (positive import, negative export). The card treats import/export explicitly when rendering.
  - `today_export`: sensor entity_id (kWh) — Optional; shown in consumer mode.
  - `today_import`: sensor entity_id (kWh) — Optional; shown in source mode.

#### BatteryDeviceConfig (`power_devices.battery`)
- `entities`:
  - `power`: sensor entity_id — Battery power (sign determines charge/discharge; card treats directions for source/consumer differently).
  - `capacity`: sensor entity_id (%) — Current SoC percent.
  - `min_soc`: sensor entity_id (%) — Target minimum.
  - `max_soc`: sensor entity_id (%) — Target maximum.
  - `remaining_energy`: sensor entity_id (Wh) — Remaining energy used to estimate time to min/max.

When sufficient battery fields are present and current power is significant, the card shows target SoC, ETA time, and wall clock time.

#### SolarDeviceConfig (`power_devices.solar`)
- `entities`:
  - `power`: sensor entity_id — Solar inverter/array power.
  - `today_energy`: sensor entity_id (Wh) — Rendered as kWh.
  - `remaining_today_energy_forecast`: sensor entity_id (Wh) — Rendered as kWh.


## Grouping by labels (house devices)
The card can group house devices into virtual groups based on HA Labels. Provide a mapping where the top-level keys are category names (rendered as chips), and each category maps label names to an emoji/text badge used in device info.

Example:
```yaml
device_label_text:
  Location:
    Kitchen: "🍳"
    Living room: "🛋️"
    Bedroom: "🛏️"
  Type:
    Heating: "🔥"
    Entertainment: "🎮"
show_empty_groups: false
show_others_group: true
others_group_label: "Other devices"
```

Usage notes:
- The chips bar appears above the house device list when `device_label_text` is configured.
- Clicking a chip switches the section to grouped view for that category. Groups are collapsed by default; expand to see members.
- Devices inherit all labels assigned to any of their entities. First matching label in the category determines the group.
- Per-device badges list all matching mappings across categories (e.g., “🍳 • 🔥”).


## Entity and data requirements
- Power sensors should have `device_class: power` so the card can locate them per device via the Entity Registry.
- The house device tree is built from Energy → Device consumption preferences (uses the `included_in_stat` relationship to form parent/child links).
- Grid `today_import`/`today_export` are expected in kWh. Solar `today_energy` and `remaining_today_energy_forecast` are expected in Wh and are shown as kWh.
- Label selection for power sensor/switch requires the Label Registry (core) and correct label assignment in HA.


## Examples

Minimal with grouping and regex cleaner:
```yaml
type: custom:helman-card
sources_title: Energy Sources
consumers_title: Energy Consumers
groups_title: Group by
max_power: 17250 # 25A x 230V x 3
history_buckets: 120
history_bucket_duration: 2
power_sensor_name_cleaner_regex: " - [Pp]ower$"
power_devices:
  house:
    unmeasured_power_title: Unmeasured
    power_sensor_label: Power
    power_switch_label: Control
    entities:
      power: sensor.house_power
  grid:
    entities:
      power: sensor.grid_power
      today_import: sensor.grid_energy_import
      today_export: sensor.grid_energy_export
  solar:
    entities:
      power: sensor.solar_power
      today_energy: sensor.solar_energy_today_wh
      remaining_today_energy_forecast: sensor.solar_forecast_remaining_wh
  battery:
    entities:
      power: sensor.battery_power
      capacity: sensor.battery_soc
      min_soc: number.battery_min_soc
      max_soc: number.battery_max_soc
      remaining_energy: sensor.battery_energy_remaining_wh
device_label_text:
  Location:
    Kitchen: "🍳"
    Living room: "🛋️"
  Type:
    Heating: "🔥"
    Entertainment: "🎮"
show_empty_groups: false
show_others_group: true
others_group_label: Other
```


## Tips and troubleshooting
- No devices shown under house: ensure Energy → Device consumption is configured and your power sensors feed the statistics used there.
- Unmeasured power: a synthetic child is added per node (except virtual grouping nodes) to account for parent minus sum(children).
- History bars frozen: confirm `history_bucket_duration` and that entities update frequently; the card appends live samples between history refreshes.
- Regex cleaner: JavaScript flags are not inline here; the card applies `g`. Use character classes for case-insensitivity (e.g., `[Pp]ower`). Test your pattern safely.


## Development
- Build (production): generates `dist/helman-card-prod.js`.
- Build (dev/watch): generates `dist/helman-card-dev.js`.

Package scripts:
```bash
npm run build-prod
npm run build-dev
npm run watch
```

Load `helman-card-dev.js` as a resource during development for faster debugging.


## License
This project includes type-only references from the Home Assistant frontend for better type safety. See LICENSE of included upstream components as applicable.
