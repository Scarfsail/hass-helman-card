import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import "./scheduling-action-chip";
import {
    getScheduleActionLabel,
    getScheduleErrorLabel,
    getScheduleReasonLabel,
} from "../model/schedule-labels";
import {
    EMPTY_SLOT_FORECAST_MAP,
    type SlotForecastMap,
    type SlotForecastPoint,
} from "../model/slot-forecast-model";
import type {
    ScheduleDialogOpenDetail,
    ScheduleSlot,
    ScheduleSlotToggleDetail,
    ScheduleTableSectionModel,
} from "../schedule-types";
import { areScheduleActionsEqual } from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

const ZERO_KWH_DISPLAY_THRESHOLD = 0.05;

function _formatSolarGaugeValue(wh: number): string {
    const kwh = wh / 1000;
    return kwh >= 10 ? `${Math.round(kwh)}` : `${kwh.toFixed(1)}`;
}

function _formatSolarGaugeTitle(wh: number): string {
    return `${_formatSolarGaugeValue(wh)} kWh`;
}

function _isZeroKwhDisplayValue(kwh: number): boolean {
    return Math.abs(kwh) < ZERO_KWH_DISPLAY_THRESHOLD;
}

function _isZeroSolarDisplayValue(wh: number): boolean {
    return _isZeroKwhDisplayValue(wh / 1000);
}

function _isZeroPriceDisplayValue(value: number): boolean {
    return Math.abs(value) < ZERO_KWH_DISPLAY_THRESHOLD;
}

function _formatKwhValue(kwh: number): string {
    const absKwh = Math.abs(kwh);
    if (absKwh >= 10) {
        return absKwh.toFixed(0);
    }

    if (absKwh >= 1) {
        return absKwh.toFixed(1);
    }

    return absKwh.toFixed(2);
}

function _formatVisiblePriceValue(value: number): string {
    return value.toFixed(1);
}

@customElement("scheduling-slot-table")
export class SchedulingSlotTable extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .slot-table {
                display: flex;
                flex-direction: column;
            }

            .day-separator {
                position: sticky;
                top: 0;
                z-index: 1;
                display: grid;
                grid-template-columns: minmax(68px, auto) 1fr;
                align-items: center;
                column-gap: 6px;
                padding: 6px 4px;
                color: var(--secondary-text-color);
                font-size: 0.78rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                background: var(--card-background-color);
            }

            .day-separator-label {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .day-separator-columns {
                display: flex;
                align-items: center;
                gap: 3px;
                min-width: 0;
            }

            .day-separator-action {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 0.72rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .day-separator-forecast {
                display: flex;
                gap: 4px;
                margin-inline-start: auto;
                min-width: 0;
            }

            .day-separator-metric {
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-width: 0;
                padding: 0 2px;
                line-height: 1.05;
                text-align: center;
            }

            .day-separator-metric.soc,
            .day-separator-metric.solar {
                width: 60px;
            }

            .day-separator-metric.grid {
                width: 68px;
            }

            .day-separator-metric.price {
                width: 96px;
            }

            .day-separator-title {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 0.72rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .day-separator-unit {
                font-size: 0.62rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .slot-row {
                display: grid;
                grid-template-columns: minmax(68px, auto) 1fr;
                grid-template-areas:
                    "time primary"
                    ". runtime";
                align-items: center;
                column-gap: 6px;
                row-gap: 1px;
                padding: 4px 8px;
                border-radius: 10px;
                transition: background-color 120ms ease, box-shadow 120ms ease;
            }

            .slot-row:hover {
                background: color-mix(in srgb, var(--primary-color) 5%, transparent);
            }

            .slot-row.selected {
                background: color-mix(in srgb, var(--primary-color) 8%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 36%, transparent);
            }

            .slot-time-button {
                grid-area: time;
                display: inline-flex;
                align-items: center;
                justify-content: flex-start;
                min-width: 0;
                padding: 6px 8px;
                border-radius: 999px;
                font-size: 0.85rem;
                font-weight: 600;
                line-height: 1.1;
                white-space: nowrap;
                cursor: pointer;
                transition: background-color 120ms ease, color 120ms ease;
            }

            .slot-time-button:hover:not(:disabled) {
                background: color-mix(in srgb, var(--primary-color) 12%, transparent);
            }

            .slot-time-button.selected {
                background: color-mix(in srgb, var(--primary-color) 18%, var(--card-background-color));
                color: var(--primary-color);
            }

            .slot-time-button.current.selected {
                background: color-mix(in srgb, var(--primary-color) 24%, var(--card-background-color));
            }

            .slot-time-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .slot-primary {
                grid-area: primary;
                display: flex;
                flex-wrap: nowrap;
                align-items: stretch;
                gap: 3px;
                min-height: 24px;
                min-width: 0;
                overflow: hidden;
            }

            .slot-primary > *,
            .slot-runtime > * {
                min-width: 0;
            }

            .slot-primary .slot-action-button,
            .slot-primary > .chip.now {
                align-self: center;
            }

            .slot-primary .slot-action-button {
                display: inline-flex;
                align-items: center;
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                cursor: pointer;
                border-radius: 999px;
            }

            .slot-action-button scheduling-action-chip,
            .slot-runtime scheduling-action-chip {
                min-width: 0;
                max-width: 100%;
            }

            .slot-primary > .chip.now,
            .slot-runtime > .chip,
            .slot-runtime > .muted {
                flex: 0 1 auto;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .slot-runtime scheduling-action-chip {
                flex: 0 1 auto;
                max-width: 100%;
            }

            .slot-action-button:hover:not(:disabled) scheduling-action-chip {
                filter: brightness(0.96);
            }

            .slot-action-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .slot-primary .chip.now,
            .slot-runtime .chip {
                min-height: 16px;
                padding: 1px 4px;
                font-size: 0.75rem;
                line-height: 1.1;
            }

            .slot-runtime {
                grid-area: runtime;
                display: flex;
                flex-wrap: nowrap;
                gap: 2px;
                align-items: center;
                min-width: 0;
                padding-bottom: 1px;
                overflow: hidden;
            }

            .slot-runtime .muted {
                font-size: 0.78rem;
                line-height: 1.1;
            }

            .slot-forecast {
                display: flex;
                flex-wrap: nowrap;
                align-items: stretch;
                align-self: stretch;
                flex: 0 1 auto;
                gap: 4px;
                margin-inline-start: auto;
                min-width: 0;
                overflow: hidden;
            }

            .slot-forecast-gauge {
                box-sizing: border-box;
                position: relative;
                display: inline-flex;
                align-items: center;
                overflow: hidden;
                width: 60px;
                min-width: 0;
                min-height: 20px;
                flex: 0 1 60px;
                padding: 1px 4px 1px 5px;
                border-radius: 4px;
                font-size: 0.7rem;
                font-weight: 700;
                line-height: 1.2;
                white-space: nowrap;
            }

            .slot-forecast-gauge > :not(.slot-forecast-gauge-fill, .slot-forecast-gauge-center) {
                position: relative;
                z-index: 1;
            }

            .slot-forecast-gauge-fill {
                position: absolute;
                inset: 0 auto 0 0;
                z-index: 0;
                border-radius: inherit;
                pointer-events: none;
            }

            .slot-forecast-gauge-center {
                position: absolute;
                top: 3px;
                bottom: 3px;
                left: 50%;
                width: 1px;
                z-index: 1;
                background: color-mix(in srgb, var(--primary-text-color) 26%, transparent);
                transform: translateX(-50%);
            }

            .slot-forecast-gauge-text {
                display: block;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .slot-forecast-gauge.battery {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 20%, transparent),
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 10%, transparent)
                );
                color: color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 34%, var(--primary-text-color));
                text-shadow:
                    0 0 1px rgba(255, 255, 255, 0.55),
                    0 1px 1px rgba(24, 44, 28, 0.12);
            }

            .slot-forecast-gauge.battery .slot-forecast-gauge-fill {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 66%, white 8%),
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 44%, transparent)
                );
            }

            .slot-forecast-gauge.solar {
                background: linear-gradient(90deg, rgba(188, 180, 164, 0.34), rgba(160, 152, 138, 0.24));
                color: rgba(58, 46, 16, 0.98);
                text-shadow:
                    0 0 1px rgba(255, 248, 224, 0.85),
                    0 1px 1px rgba(73, 57, 16, 0.18);
            }

            .slot-forecast-gauge.solar .slot-forecast-gauge-fill {
                background: linear-gradient(90deg, rgba(255, 213, 59, 0.66), rgba(245, 185, 18, 0.44));
            }

            .slot-forecast-gauge.grid {
                justify-content: flex-end;
                width: 68px;
                flex-basis: 68px;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 18%, transparent),
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 8%, transparent),
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 18%, transparent)
                );
                color: color-mix(in srgb, var(--primary-text-color) 92%, transparent);
                text-shadow:
                    0 0 1px rgba(255, 255, 255, 0.55),
                    0 1px 1px rgba(24, 32, 52, 0.1);
            }

            .slot-forecast-gauge.grid .slot-forecast-gauge-fill.import {
                inset: 0 auto 0 auto;
                right: 50%;
                left: auto;
                background: linear-gradient(
                    270deg,
                    color-mix(in srgb, #2563eb 74%, white 6%),
                    color-mix(in srgb, #2563eb 46%, transparent)
                );
                border-radius: 4px 0 0 4px;
            }

            .slot-forecast-gauge.grid .slot-forecast-gauge-fill.export {
                inset: 0 auto 0 50%;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-grid-accent, #7dd3fc) 74%, white 6%),
                    color-mix(in srgb, var(--simple-card-grid-accent, #7dd3fc) 46%, transparent)
                );
                border-radius: 0 4px 4px 0;
            }

            .slot-forecast-gauge.grid .slot-forecast-gauge-text {
                text-align: end;
                font-variant-numeric: tabular-nums;
            }

            .slot-forecast-gauge.price {
                width: 96px;
                flex-basis: 96px;
                justify-content: flex-end;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--forecast-price-negative, #6d4c41) 12%, transparent),
                    color-mix(in srgb, var(--card-background-color) 88%, transparent),
                    color-mix(in srgb, var(--forecast-price-positive, #8d6e63) 12%, transparent)
                );
                color: color-mix(in srgb, var(--primary-text-color) 92%, transparent);
                text-shadow:
                    0 0 1px rgba(255, 255, 255, 0.55),
                    0 1px 1px rgba(36, 24, 20, 0.12);
            }

            .slot-forecast-gauge.price .slot-forecast-gauge-fill.negative {
                inset: 0 auto 0 auto;
                right: 50%;
                left: auto;
                background: linear-gradient(
                    270deg,
                    color-mix(in srgb, var(--forecast-price-negative, #6d4c41) 84%, white 6%),
                    color-mix(in srgb, var(--forecast-price-negative, #6d4c41) 46%, transparent)
                );
                border-radius: 4px 0 0 4px;
            }

            .slot-forecast-gauge.price .slot-forecast-gauge-fill.positive {
                inset: 0 auto 0 50%;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--forecast-price-positive, #8d6e63) 84%, white 6%),
                    color-mix(in srgb, var(--forecast-price-positive, #8d6e63) 46%, transparent)
                );
                border-radius: 0 4px 4px 0;
            }

            .slot-forecast-gauge.price .slot-forecast-gauge-text {
                flex: 1 1 auto;
                text-align: end;
                font-variant-numeric: tabular-nums;
            }

            .slot-forecast-gauge.zero {
                color: var(--secondary-text-color);
                background: color-mix(in srgb, var(--secondary-text-color) 14%, transparent);
                text-shadow: none;
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--secondary-text-color) 16%, transparent);
            }

            .slot-forecast-gauge.zero .slot-forecast-gauge-center {
                background: color-mix(in srgb, var(--secondary-text-color) 32%, transparent);
            }

            .slot-forecast-gauge.unavailable {
                opacity: 0.4;
            }
        `,
    ];

    private _selectedSet: ReadonlySet<string> = new Set();

    @property({ attribute: false }) public sections: ScheduleTableSectionModel[] = [];
    @property({ attribute: false }) public selectedSlotIds: string[] = [];
    @property({ attribute: false }) public slotForecastMap: SlotForecastMap = EMPTY_SLOT_FORECAST_MAP;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: Boolean }) public busy = false;
    @property({ type: Boolean }) public executionEnabled = false;

    willUpdate(changedProperties: Map<string, unknown>): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has("selectedSlotIds")) {
            this._selectedSet = new Set(this.selectedSlotIds);
        }
    }

    render() {
        return html`
            <div class="slot-table">
                ${this.sections.map((section) => html`
                    ${this._renderDaySeparator(section)}
                    ${section.slots.map((slot) => this._renderSlotRow(slot))}
                `)}
            </div>
        `;
    }

    private _renderDaySeparator(section: ScheduleTableSectionModel) {
        return html`
            <div class="day-separator">
                <div class="day-separator-label">${section.dayLabel}</div>
                <div class="day-separator-columns">
                    <div class="day-separator-action">${this.localize("scheduling.table.action_label")}</div>
                    <div class="day-separator-forecast">
                        ${this._renderHeaderMetric("soc", this.localize("scheduling.table.soc_label"), "%")}
                        ${this._renderHeaderMetric("solar", this.localize("scheduling.table.solar_label"), "kWh")}
                        ${this._renderHeaderMetric("grid", this.localize("scheduling.table.grid_label"), "kWh")}
                        ${this._renderHeaderMetric("price", this.localize("scheduling.table.price_label"), this.slotForecastMap.priceDisplayUnit ?? "")}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderHeaderMetric(type: "soc" | "solar" | "grid" | "price", title: string, unit: string) {
        return html`
            <div class=${`day-separator-metric ${type}`}>
                <span class="day-separator-title">${title}</span>
                <span class="day-separator-unit">${unit}</span>
            </div>
        `;
    }

    private _renderSlotRow(slot: ScheduleSlot) {
        const selected = this._selectedSet.has(slot.id);
        const classes = `slot-row${slot.isCurrent ? " current" : ""}${selected ? " selected" : ""}`;
        const timeButtonClasses = `button-reset slot-time-button${selected ? " selected" : ""}${slot.isCurrent ? " current" : ""}`;

        return html`
            <div class=${classes}>
                <button
                    class=${timeButtonClasses}
                    type="button"
                    ?disabled=${this.busy}
                    aria-label=${`${this.localize("scheduling.actions.select_slot")} ${slot.rangeLabel}`}
                    aria-pressed=${selected ? "true" : "false"}
                    @click=${(event: MouseEvent) => this._handleTimeClick(slot.id, event)}
                >
                    ${slot.timeLabel}
                </button>
                <div class="slot-primary">
                    <button
                        class="button-reset slot-action-button"
                        type="button"
                        ?disabled=${this.busy}
                        aria-label=${`${getScheduleActionLabel(slot.action, this.localize)} ${slot.rangeLabel}`}
                        @click=${() => this._handleActionClick(slot.id)}
                    >
                        <scheduling-action-chip
                            .action=${slot.action}
                            .localize=${this.localize}
                            size="compact"
                        ></scheduling-action-chip>
                    </button>
                    ${slot.isCurrent ? html`<div class="chip now">${this.localize("scheduling.badge.now")}</div>` : nothing}
                    ${this._renderForecastGauges(slot)}
                </div>
                ${slot.isCurrent ? html`
                    <div class="slot-runtime">${this._renderSlotRuntime(slot)}</div>
                ` : nothing}
            </div>
        `;
    }

    private _renderForecastGauges(slot: ScheduleSlot) {
        const map = this.slotForecastMap;
        if (map.points.size === 0) {
            return nothing;
        }

        const point = map.points.get(slot.id);
        return html`
            <div class="slot-forecast">
                ${this._renderGauge(
                    "battery",
                    map.batteryAvailable,
                    point?.socPct ?? null,
                    100,
                )}
                ${this._renderGauge(
                    "solar",
                    map.solarAvailable,
                    point?.solarWh ?? null,
                    map.solarMaxWh,
                )}
                ${this._renderGridGauge(point, map)}
                ${this._renderPriceGauge(point, map)}
            </div>
        `;
    }

    private _renderGauge(
        type: "battery" | "solar",
        available: boolean,
        value: number | null,
        maxValue: number,
    ) {
        if (!available || value === null) {
            return html`
                <div class="slot-forecast-gauge ${type} unavailable" aria-hidden="true">
                </div>
            `;
        }

        const isZero = type === "solar" && _isZeroSolarDisplayValue(value);
        const widthPct = maxValue > 0 && !isZero
            ? Math.min((value / maxValue) * 100, 100)
            : 0;
        const label = type === "battery"
            ? `${Math.round(value)}`
            : _formatSolarGaugeValue(value);
        const classes = `slot-forecast-gauge ${type}${isZero ? " zero" : ""}`;

        return html`
            <div
                class=${classes}
                role="img"
                aria-label=${this._buildGaugeTitle(type, value)}
                title=${this._buildGaugeTitle(type, value)}
            >
                ${widthPct > 0 ? html`
                    <span
                        class="slot-forecast-gauge-fill"
                        style=${`width:${widthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                ${label !== null ? html`<span class="slot-forecast-gauge-text">${label}</span>` : nothing}
            </div>
        `;
    }

    private _renderGridGauge(point: SlotForecastPoint | undefined, map: SlotForecastMap) {
        if (!map.gridAvailable || point?.gridNetKwh === null || point?.gridNetKwh === undefined) {
            return html`
                <div class="slot-forecast-gauge grid unavailable" aria-hidden="true">
                </div>
            `;
        }

        const isZero = _isZeroKwhDisplayValue(point.gridNetKwh);
        const displayValue = isZero ? 0 : point.gridNetKwh;
        const direction = displayValue > 0
            ? "export"
            : displayValue < 0
            ? "import"
            : null;
        const widthPct = map.gridMaxAbsKwh > 0 && direction !== null
            ? Math.min((Math.abs(displayValue) / map.gridMaxAbsKwh) * 50, 50)
            : 0;
        const classes = `slot-forecast-gauge grid${isZero ? " zero" : ""}`;

        return html`
            <div
                class=${classes}
                role="img"
                aria-label=${this._buildGridGaugeTitle(point)}
                title=${this._buildGridGaugeTitle(point)}
            >
                <span class="slot-forecast-gauge-center" aria-hidden="true"></span>
                ${direction !== null && widthPct > 0 ? html`
                    <span
                        class="slot-forecast-gauge-fill ${direction}"
                        style=${`width:${widthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                <span class="slot-forecast-gauge-text">${this._formatVisibleGridNet(displayValue)}</span>
            </div>
        `;
    }

    private _renderPriceGauge(point: SlotForecastPoint | undefined, map: SlotForecastMap) {
        if (!map.priceAvailable || !point || point.price === null) {
            return html`
                <div class="slot-forecast-gauge price unavailable" aria-hidden="true">
                </div>
            `;
        }

        const isZero = _isZeroPriceDisplayValue(point.price);
        const displayValue = isZero ? 0 : point.price;
        const direction = displayValue < 0
            ? "negative"
            : displayValue > 0
            ? "positive"
            : null;
        const widthPct = map.priceMaxAbs > 0 && direction !== null
            ? Math.min((Math.abs(displayValue) / map.priceMaxAbs) * 50, 50)
            : 0;

        return html`
            <div
                class=${`slot-forecast-gauge price${isZero ? " zero" : ""}`}
                role="img"
                aria-label=${this._buildPriceGaugeTitle(displayValue, map.priceDisplayUnit)}
                title=${this._buildPriceGaugeTitle(displayValue, map.priceDisplayUnit)}
            >
                <span class="slot-forecast-gauge-center" aria-hidden="true"></span>
                ${direction !== null && widthPct > 0 ? html`
                    <span
                        class=${`slot-forecast-gauge-fill ${direction}`}
                        style=${`width:${widthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                <span class="slot-forecast-gauge-text">${_formatVisiblePriceValue(displayValue)}</span>
            </div>
        `;
    }

    private _renderSlotRuntime(slot: ScheduleSlot) {
        if (!this.executionEnabled) {
            return html`<div class="chip disabled">${this.localize("scheduling.now.execution_disabled")}</div>`;
        }

        if (slot.runtime === null) {
            return html`<div class="muted">${this.localize("scheduling.now.runtime_unavailable")}</div>`;
        }

        const reasonLabel = getScheduleReasonLabel(slot.runtime.reason, this.localize);
        const runtimeState = this._getRuntimeState(slot);
        const reasonChipClass = runtimeState === "following"
            ? "chip success"
            : runtimeState === "error"
            ? "chip error"
            : "chip reason";
        if (slot.runtime.status === "error") {
            return html`
                <div class="chip error">
                    ${getScheduleErrorLabel({
                        code: slot.runtime.errorCode,
                        fallbackMessage: this.localize("scheduling.runtime.error"),
                        localize: this.localize,
                    })}
                </div>
                ${slot.runtime.executedAction ? html`
                    ${this._renderRuntimeActionChip(slot.runtime.executedAction, runtimeState)}
                ` : nothing}
                ${reasonLabel ? html`<div class=${reasonChipClass}>${reasonLabel}</div>` : nothing}
            `;
        }

        return html`
            ${slot.runtime.executedAction
                ? this._renderRuntimeActionChip(slot.runtime.executedAction, runtimeState)
                : html`<div class=${runtimeState === "following" ? "chip success" : "chip runtime"}>${this.localize("scheduling.runtime.applied")}</div>`}
            ${reasonLabel ? html`<div class=${reasonChipClass}>${reasonLabel}</div>` : nothing}
        `;
    }

    private _renderRuntimeActionChip(
        action: ScheduleSlot["action"],
        runtimeState: "following" | "diverged" | "error",
    ) {
        return html`
            <scheduling-action-chip
                .action=${action}
                .localize=${this.localize}
                size="compact"
                surface="runtime"
                .runtimeState=${runtimeState}
            ></scheduling-action-chip>
        `;
    }

    private _getRuntimeState(slot: ScheduleSlot): "following" | "diverged" | "error" {
        const runtime = slot.runtime;
        if (runtime === null || runtime.status === "error") {
            return runtime?.status === "error" ? "error" : "diverged";
        }

        if (runtime.executedAction) {
            return areScheduleActionsEqual(slot.action, runtime.executedAction)
                ? "following"
                : "diverged";
        }

        return runtime.reason === "scheduled" ? "following" : "diverged";
    }

    private _buildGridGaugeTitle(point: SlotForecastPoint): string {
        return [
            this.localize("scheduling.forecast.grid_label"),
            `${this.localize("scheduling.forecast.net")}: ${this._formatSignedGridEnergy(point.gridNetKwh ?? 0)}`,
            `${this.localize("scheduling.forecast.import")}: ${this._formatGridEnergy(point.gridImportKwh ?? 0)}`,
            `${this.localize("scheduling.forecast.export")}: ${this._formatGridEnergy(point.gridExportKwh ?? 0)}`,
        ].join(" · ");
    }

    private _buildPriceGaugeTitle(price: number, unit: string | null): string {
        return `${this.localize("scheduling.forecast.price_label")}: ${this._formatPriceValue(price, unit)}`;
    }

    private _buildGaugeTitle(type: "battery" | "solar", value: number): string {
        const gaugeLabel = type === "battery"
            ? this.localize("scheduling.forecast.battery_label")
            : this.localize("scheduling.forecast.solar_label");
        const label = type === "battery"
            ? `${Math.round(value)}%`
            : _formatSolarGaugeTitle(value);
        return `${gaugeLabel}: ${label}`;
    }

    private _formatVisibleGridNet(kwh: number): string {
        const prefix = kwh > 0 ? "+" : kwh < 0 ? "−" : "";
        return `${prefix}${Math.abs(kwh).toFixed(1)}`;
    }

    private _formatCompactGridNet(kwh: number): string {
        const prefix = kwh > 0 ? "+" : kwh < 0 ? "−" : "";
        return `${prefix}${_formatKwhValue(kwh)}`;
    }

    private _formatSignedGridEnergy(kwh: number): string {
        return `${this._formatCompactGridNet(kwh)} kWh`;
    }

    private _formatGridEnergy(kwh: number): string {
        return `${_formatKwhValue(kwh)} kWh`;
    }

    private _formatPriceValue(value: number, unit: string | null): string {
        const formattedValue = _formatVisiblePriceValue(value);
        return unit ? `${formattedValue} ${unit}` : formattedValue;
    }

    private _handleTimeClick(slotId: string, event: MouseEvent): void {
        if (this.busy) {
            return;
        }

        this.dispatchEvent(new CustomEvent("toggle-schedule-slot-selection", {
            bubbles: true,
            composed: true,
            detail: { slotId, shiftKey: event.shiftKey } satisfies ScheduleSlotToggleDetail,
        }));
    }

    private _handleActionClick(slotId: string): void {
        if (this.busy) {
            return;
        }

        this.dispatchEvent(new CustomEvent("open-schedule-dialog", {
            bubbles: true,
            composed: true,
            detail: { slotId } satisfies ScheduleDialogOpenDetail,
        }));
    }
}
