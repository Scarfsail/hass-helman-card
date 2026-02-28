import { LitElement, css, html, svg } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import { HelmanSimpleCardConfig } from "./HelmanSimpleCardConfig";
import "./simple-card-solar";
import "./simple-card-battery";
import "./simple-card-grid";
import "./simple-card-house";

// ──────────────────────────────── Color constants ─────────────────────────────

const SOLAR_COLOR = '#facc15'; // yellow-400 — matches solar component
const GRID_COLOR  = '#38bdf8'; // sky-400    — matches grid import
const BATT_COLOR  = '#22c55e'; // green-500  — matches battery producer/charging border

/** Weighted RGB average of hex color values. Returns gray if no active inputs. */
function blendHex(colors: { hex: string; weight: number }[]): string {
    const active = colors.filter(c => c.weight > 0);
    if (active.length === 0) return '#6b7280';
    if (active.length === 1) return active[0].hex;
    const total = active.reduce((s, c) => s + c.weight, 0);
    let r = 0, g = 0, b = 0;
    for (const { hex, weight } of active) {
        const n = parseInt(hex.slice(1), 16);
        r += ((n >> 16) & 0xff) * weight / total;
        g += ((n >> 8)  & 0xff) * weight / total;
        b += (n         & 0xff) * weight / total;
    }
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ──────────────────────────────── Backend DTO types ───────────────────────────

type ValueType = "default" | "positive" | "negative";

interface DeviceNodeDTO {
    id: string;
    powerSensorId: string | null;
    valueType: ValueType;
    sourceConfig: any | null;
    sourceType: string | null;
    children: DeviceNodeDTO[];
}

interface TreePayload {
    sources: DeviceNodeDTO[];
    consumers: DeviceNodeDTO[];
}

// ──────────────────────────────── Internal model ──────────────────────────────

interface EnergyEntityMap {
    solarPowerEntityId:   string | null;
    solarValueType:       ValueType;
    gridPowerEntityId:    string | null;
    gridValueType:        ValueType;
    batteryPowerEntityId: string | null;
    batterySocEntityId:   string | null;
    batteryMinSocEntityId:string | null;
    housePowerEntityId:   string | null;
    solarMaxPower:        number;
    gridMaxPower:         number;
    batteryMaxPower:      number;
}

interface EnergyValues {
    solarPower:   number;
    gridPower:    number;
    batteryPower: number;
    batterySoc:   number;
    batteryMinSoc:number;
    housePower:   number;
}

const EMPTY_ENERGY: EnergyValues = {
    solarPower: 0, gridPower: 0, batteryPower: 0,
    batterySoc: 0, batteryMinSoc: 10,
    housePower: 0,
};

// ──────────────────────────────────── Card ────────────────────────────────────

@customElement("helman-simple-card")
export class HelmanSimpleCard extends LitElement implements LovelaceCard {

    // 1. Static HA configuration methods
    public static async getStubConfig(_hass: HomeAssistant): Promise<Partial<HelmanSimpleCardConfig>> {
        return { type: "custom:helman-simple-card" };
    }

    public static getConfigForm() {
        return {
            schema: [
                {
                    name: "width",
                    selector: { number: { min: 100, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } },
                },
                {
                    name: "height",
                    selector: { number: { min: 100, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } },
                },
                {
                    name: "transparent_background",
                    selector: { boolean: {} },
                },
            ],
        };
    }

    // 2. Static styles
    static styles = css`
        :host { display: block; }
        ha-card { overflow: hidden; }
        ha-card.transparent {
            background: transparent;
            box-shadow: none;
            border: none;
        }
        .card-content {
            padding: 8px;
            max-width: 850px;
            margin: 0 auto;
            box-sizing: border-box;
        }

        /* 3×3 CSS grid: node | connector | node */
        .energy-grid {
            display: grid;
            grid-template-columns: 1fr 20px 1fr;
            grid-template-rows: auto 28px auto;
            align-items: center;
            justify-items: center;
            margin: 0 auto;
            width: 200px;
            position: relative;
        }
        .node-cell {
            width: 100%;
            display: flex;
            justify-content: center;
            padding: 2px 0;
        }
        .connector-h,
        .connector-v {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .connector-h { width: 100%; height: 12px; flex-direction: row; }
        .connector-v { width: 20px; height: 100%; flex-direction: column; align-self: stretch; justify-content: center; }

        /* SVG flow overlay (all flows use this) */
        .diagonal-overlay {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            overflow: visible;
        }
        @keyframes flow-diagonal {
            0%   { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -18; }
        }

        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 40px;
            color: var(--secondary-text-color);
            font-size: 0.9rem;
        }
    `;

    // 3. Private properties
    private _config!: HelmanSimpleCardConfig;
    private _entityMap: EnergyEntityMap | null = null;

    // 5. State properties
    @state() private _hass?: HomeAssistant;
    @state() private _energy: EnergyValues = EMPTY_ENERGY;
    @state() private _loading = true;

    // 7. HA-specific property setter
    public set hass(value: HomeAssistant) {
        this._hass = value;
        if (this._entityMap) {
            this._energy = this._readEnergyValues(value, this._entityMap);
        }
    }

    // 8. HA-specific methods
    getCardSize() { return 4; }

    setConfig(config: HelmanSimpleCardConfig) {
        this._config = { ...config };
    }

    // 9. Lifecycle methods
    async connectedCallback() {
        super.connectedCallback();
        if (this._hass) {
            await this._loadFromBackend();
        }
    }

    // 10. Render method
    render() {
        if (this._loading || !this._entityMap) {
            return html`<ha-card class=${this._config?.transparent_background ? "transparent" : ""}><div class="loading">Loading energy data…</div></ha-card>`;
        }

        const { solarPower, gridPower, housePower, batteryPower,
                batterySoc, batteryMinSoc } = this._energy;

        const solarActive   = solarPower > 20;
        const battCharge    = batteryPower > 20;
        const battDischarge = batteryPower < -20;

        // Infer solar→grid export from power balance (sign-convention independent)
        const solarToGrid = Math.max(0, solarPower - housePower - Math.max(0, batteryPower));
        const solarExportingToGrid = solarToGrid > 20;

        // Effective grid power: if the sensor reads ≈0 but solar is clearly exporting,
        // derive the export value from the power balance (negative = exporting)
        const effectiveGridPower = (Math.abs(gridPower) < 20 && solarExportingToGrid)
            ? -solarToGrid
            : gridPower;
        const gridImport = effectiveGridPower > 20;

        const em = this._entityMap;
        const intensity = (power: number, max: number) => Math.min(Math.abs(power) / max, 1);
        const thick = (i: number) => 2 + i * 10;

        const gridI  = intensity(effectiveGridPower,   em.gridMaxPower);
        const battI  = intensity(batteryPower,         em.batteryMaxPower);

        // Distribute solar power proportionally among its destinations
        // Cap solarToBatt at actual solar output (battery may also be charging from grid)
        const solarToBattPower  = solarActive && battCharge ? Math.min(solarPower, Math.max(0, batteryPower)) : 0;
        const solarToGridPower  = solarExportingToGrid ? solarToGrid : 0;
        const solarToHousePower = Math.max(0, solarPower - solarToBattPower - solarToGridPower);

        const solarToHouseI = intensity(solarToHousePower, em.solarMaxPower);
        const solarToGridI  = intensity(solarToGridPower,  em.solarMaxPower);
        const solarToBattI  = intensity(solarToBattPower,  em.solarMaxPower);

        const solarToHouseT = thick(solarToHouseI);
        const solarToGridT  = thick(solarToGridI);
        const solarToBattT  = thick(solarToBattI);
        const gridT         = thick(gridI);
        const battT         = thick(battI);

        const gridSvgW      = 1 + gridI      * 5;
        const battSvgW      = 1 + battI      * 5;
        const solarToBattSvgW = 1 + solarToBattI * 5;

        // ── Source colors for consumer components ──────────────────────────────
        // Battery source: solar contributes min(solar, battPower), grid covers the rest
        const solarPortionToBatt = solarActive && battCharge ? Math.min(solarPower, batteryPower) : 0;
        const gridPortionToBatt  = battCharge ? Math.max(0, batteryPower - solarPortionToBatt) : 0;
        const battSourceColor = battCharge
            ? blendHex([{ hex: SOLAR_COLOR, weight: solarPortionToBatt }, { hex: GRID_COLOR, weight: gridPortionToBatt }])
            : undefined;

        // Grid source color when exporting: always solar in current model
        const gridSourceColor = solarExportingToGrid ? SOLAR_COLOR : undefined;

        // House source: solar direct, battery discharge, remainder from grid
        const battToHousePower  = battDischarge ? Math.abs(batteryPower) : 0;
        const gridToHousePower  = Math.max(0, housePower - solarToHousePower - battToHousePower);
        const houseSourceColor  = housePower > 10
            ? blendHex([
                { hex: SOLAR_COLOR, weight: solarToHousePower },
                { hex: GRID_COLOR,  weight: gridToHousePower  },
                { hex: BATT_COLOR,  weight: battToHousePower  },
            ])
            : undefined;

        const gridStyle = this._buildGridStyle();

        return html`
            <ha-card class=${this._config?.transparent_background ? "transparent" : ""}>
                <div class="card-content">
                    <div class="energy-grid" style=${gridStyle}>

                        <!-- ── Row 1: Solar  ─── connector ─── Grid ── -->
                        <div class="node-cell">
                            <simple-card-solar .power=${solarPower}></simple-card-solar>
                        </div>
                        <div class="connector-h">
                            ${solarExportingToGrid ? this._flowH(SOLAR_COLOR, `${SOLAR_COLOR}aa`, false, solarToGridT, 22.5, 33) : ""}
                        </div>
                        <div class="node-cell">
                            <simple-card-grid .power=${effectiveGridPower} .sourceColor=${gridSourceColor}></simple-card-grid>
                        </div>

                        <!-- ── Row 2: vertical connectors ── -->
                        <div class="connector-v">
                            ${solarActive ? this._flowV(SOLAR_COLOR, `${SOLAR_COLOR}aa`, false, solarToHouseT) : ""}
                        </div>
                        <div></div>
                        <div class="connector-v">
                            ${(gridImport && battCharge) ? this._flowV(GRID_COLOR, `${GRID_COLOR}aa`, false, gridT) : ""}
                        </div>

                        <!-- ── Row 3: House ─── connector ─── Battery ── -->
                        <div class="node-cell">
                            <simple-card-house .power=${housePower} .sourceColor=${houseSourceColor}></simple-card-house>
                        </div>
                        <div class="connector-h"></div>
                        <div class="node-cell">
                            <simple-card-battery
                                .power=${batteryPower}
                                .soc=${batterySoc}
                                .minSoc=${batteryMinSoc}
                                .sourceColor=${battSourceColor}
                            ></simple-card-battery>
                        </div>

                        ${(gridImport || battDischarge || (solarActive && battCharge)) ? this._renderFlowOverlay(gridImport, battDischarge, solarActive && battCharge, gridSvgW, battSvgW, solarToBattSvgW) : ""}

                    </div>
                </div>
            </ha-card>
        `;
    }

    // 12. Private helper methods

    private _buildGridStyle(): string {
        const w = this._config?.width;
        const h = this._config?.height;
        const parts: string[] = [];
        if (w !== undefined) parts.push(`width: ${w}px`);
        if (h !== undefined) parts.push(`height: ${h}px`, `grid-template-rows: 1fr 28px 1fr`);
        return parts.join("; ");
    }

    private async _loadFromBackend(): Promise<void> {
        try {
            const payload = await this._hass!.connection.sendMessagePromise<TreePayload>({
                type: "helman/get_device_tree",
            });
            this._entityMap = this._buildEntityMap(payload);
            this._energy = this._readEnergyValues(this._hass!, this._entityMap);
        } catch (err) {
            console.error("helman-simple-card: failed to load backend data", err);
        } finally {
            this._loading = false;
        }
    }

    private _buildEntityMap(payload: TreePayload): EnergyEntityMap {
        const solarNode   = payload.sources.find(n => n.sourceType === "solar");
        const gridNode    = payload.sources.find(n => n.sourceType === "grid");
        const batteryNode = payload.sources.find(n => n.sourceType === "battery");
        const houseNode   = this._findHouseNode(payload.consumers);

        const battCfg = batteryNode?.sourceConfig?.entities ?? {};

        return {
            solarPowerEntityId:    solarNode?.powerSensorId   ?? null,
            solarValueType:        solarNode?.valueType       ?? "default",
            gridPowerEntityId:     gridNode?.powerSensorId    ?? null,
            gridValueType:         gridNode?.valueType        ?? "default",
            batteryPowerEntityId:  batteryNode?.powerSensorId ?? null,
            batterySocEntityId:    battCfg.capacity           ?? null,
            batteryMinSocEntityId: battCfg.min_soc            ?? null,
            housePowerEntityId:    houseNode?.powerSensorId   ?? null,
            solarMaxPower:   Math.max(1, solarNode?.sourceConfig?.max_power   ?? 5000),
            gridMaxPower:    Math.max(1, gridNode?.sourceConfig?.max_power    ?? 11500),
            batteryMaxPower: Math.max(1, batteryNode?.sourceConfig?.max_power ?? 5000),
        };
    }

    /** Recursively finds the house node (by sourceType or known id) in the consumers tree. */
    private _findHouseNode(nodes: DeviceNodeDTO[]): DeviceNodeDTO | undefined {
        for (const node of nodes) {
            if (node.sourceType === "house" || node.id === "house") return node;
            const found = this._findHouseNode(node.children);
            if (found) return found;
        }
        return undefined;
    }

    private _readEnergyValues(hass: HomeAssistant, map: EnergyEntityMap): EnergyValues {
        const rawPower = (entityId: string | null): number =>
            entityId ? parseFloat(hass.states[entityId]?.state ?? "0") || 0 : 0;

        const applyValueType = (raw: number, vt: ValueType): number => {
            if (vt === "positive") return Math.max(0, raw);
            if (vt === "negative") return Math.abs(Math.min(0, raw));
            return raw;
        };

        const batterySoc = Math.max(0, Math.min(100, rawPower(map.batterySocEntityId)));

        return {
            solarPower:   applyValueType(rawPower(map.solarPowerEntityId),   map.solarValueType),
            gridPower:    applyValueType(rawPower(map.gridPowerEntityId),    map.gridValueType),
            batteryPower: rawPower(map.batteryPowerEntityId),
            batterySoc,
            batteryMinSoc: rawPower(map.batteryMinSocEntityId) || 10,
            housePower:         Math.max(0, rawPower(map.housePowerEntityId)),
        };
    }

    private _renderFlowOverlay(gridImport: boolean, battDischarge: boolean, solarToBattery: boolean, gridStrokeWidth: number, battStrokeWidth: number, solarStrokeWidth: number) {
        // SVG overlays the full energy-grid (viewBox 0 0 200 168).
        // Column centers: House=45, Grid/Battery=155. Row centers: top≈35, bottom≈133.
        return html`
            <svg class="diagonal-overlay" viewBox="0 0 200 168"
                 preserveAspectRatio="none"
                 xmlns="http://www.w3.org/2000/svg">
                ${ solarToBattery ? svg`
                    <line x1="62" y1="48" x2="138" y2="120"
                          stroke="${SOLAR_COLOR}"
                          stroke-width=${solarStrokeWidth}
                          stroke-linecap="round"
                          stroke-dasharray="2 16"
                          style="animation: flow-diagonal 1.6s linear infinite;
                                 filter: drop-shadow(0 0 3px ${SOLAR_COLOR}aa)" />
                ` : ""}
                ${ gridImport ? svg`
                    <line x1="138" y1="48" x2="62" y2="120"
                          stroke="${GRID_COLOR}"
                          stroke-width=${gridStrokeWidth}
                          stroke-linecap="round"
                          stroke-dasharray="2 16"
                          style="animation: flow-diagonal 1.6s linear infinite;
                                 filter: drop-shadow(0 0 3px ${GRID_COLOR}aa)" />
                ` : ""}
                ${ battDischarge ? svg`
                    <line x1="130" y1="133" x2="70" y2="133"
                          stroke="${BATT_COLOR}"
                          stroke-width=${battStrokeWidth}
                          stroke-linecap="round"
                          stroke-dasharray="2 16"
                          style="animation: flow-diagonal 1.6s linear infinite;
                                 filter: drop-shadow(0 0 3px ${BATT_COLOR}aa)" />
                ` : ""}
            </svg>`;
    }

    private _flowH(color: string, glow: string, reverse: boolean, strokeWidth: number, leftOverhang = 0, rightOverhang = 0) {
        const sw = Math.max(2, Math.round(strokeWidth));
        // connectorW matches the 20px CSS grid connector column so absolute SVG
        // coordinates (no viewBox) map 1:1 to pixels, letting us reach actual
        // picture borders on both sides via overflow:visible.
        const connectorW = 20;
        const x1 = reverse ? connectorW + rightOverhang : -leftOverhang;
        const x2 = reverse ? -leftOverhang : connectorW + rightOverhang;
        return html`
            <svg width="100%" height="100%" style="display:block; overflow:visible">
                <line x1="${x1}" y1="50%" x2="${x2}" y2="50%"
                      stroke="${color}" stroke-width="${sw}"
                      stroke-linecap="round" stroke-dasharray="2 16"
                      style="animation: flow-diagonal 1.6s linear infinite;
                             filter: drop-shadow(0 0 3px ${glow})" />
            </svg>`;
    }

    private _flowV(color: string, glow: string, reverse: boolean, strokeWidth: number) {
        const sw = Math.max(2, Math.round(strokeWidth));
        const y1 = reverse ? "100%" : "0%";
        const y2 = reverse ? "0%" : "100%";
        return html`
            <svg width="100%" height="100%" style="display:block; overflow:visible">
                <line x1="50%" y1="${y1}" x2="50%" y2="${y2}"
                      stroke="${color}" stroke-width="${sw}"
                      stroke-linecap="round" stroke-dasharray="2 16"
                      style="animation: flow-diagonal 1.6s linear infinite;
                             filter: drop-shadow(0 0 3px ${glow})" />
            </svg>`;
    }
}

// Card registration
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: "helman-simple-card",
    name: "Helman Simple Energy Card",
    description: "Compact animated visualization of solar, battery, grid and house power.",
    preview: true,
});
