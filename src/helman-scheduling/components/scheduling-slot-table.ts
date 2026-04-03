import { LitElement, css, html, type PropertyValues } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import "./scheduling-action-chip";
import "./scheduling-appliance-chip";
import { getScheduleApplianceActionPresentation } from "../model/schedule-appliance-action-presentation";
import {
    getScheduleActionLabel,
    getScheduleErrorLabel,
    getScheduleReasonLabel,
} from "../model/schedule-labels";
import {
    type SlotForecastPoint,
} from "../model/slot-forecast-model";
import {
    EMPTY_SCHEDULE_TABLE_MODEL,
    type ScheduleTableActionCellModel,
    type ScheduleTableAppliancePillModel,
    type ScheduleHourToggleDetail,
    type ScheduleTableHourRowModel,
    type ScheduleTableModel,
    type ScheduleTableRowModel,
    type ScheduleTableSectionModel,
    type ScheduleTableSlotRowModel,
} from "../schedule-table-types";
import type {
    ScheduleDialogOpenDetail,
    ScheduleSlot,
    ScheduleSlotToggleDetail,
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
            :host {
                --schedule-table-action-chip-width: 32px;
                --schedule-table-appliance-lane-width: calc(var(--schedule-table-action-chip-width) * 2 + 6px);
                --schedule-table-disclosure-width: 16px;
                --schedule-table-forecast-gap: 4px;
            }

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
                display: grid;
                grid-template-columns: var(--schedule-table-action-chip-width) repeat(4, minmax(0, 1fr));
                align-items: center;
                column-gap: var(--schedule-table-forecast-gap);
                min-width: 0;
                width: 100%;
            }

            .day-separator-columns.with-appliances {
                grid-template-columns:
                    var(--schedule-table-action-chip-width)
                    minmax(0, var(--schedule-table-appliance-lane-width))
                    repeat(4, minmax(0, 1fr));
            }

            .day-separator-action {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 0.72rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .day-separator-columns.with-appliances .day-separator-action {
                grid-column: 1 / span 2;
            }

            .day-separator-forecast {
                display: contents;
            }

            .day-separator-metric {
                box-sizing: border-box;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-width: 0;
                padding: 0 2px;
                line-height: 1.05;
                text-align: center;
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
                padding: 4px 8px 4px 6px;
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

            .slot-row.partially-selected {
                background: color-mix(in srgb, var(--primary-color) 5%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent);
            }

            .slot-row.hour-child {
                background: color-mix(in srgb, var(--secondary-text-color) 6%, transparent);
            }

            .slot-row.hour-child:hover {
                background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background-color));
            }

            .slot-time-button {
                display: inline-flex;
                align-items: center;
                justify-content: flex-start;
                flex: 0 1 auto;
                min-width: 0;
                padding: 6px 6px 6px 4px;
                border-radius: 999px;
                font-size: 0.85rem;
                font-weight: 600;
                line-height: 1.1;
                white-space: nowrap;
                overflow: hidden;
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

            .slot-time-group {
                grid-area: time;
                display: inline-flex;
                align-items: center;
                gap: 0;
                min-width: 0;
            }

            .slot-time-indent {
                flex: 0 0 var(--schedule-table-disclosure-width);
                width: var(--schedule-table-disclosure-width);
            }

            .slot-disclosure-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 var(--schedule-table-disclosure-width);
                width: var(--schedule-table-disclosure-width);
                height: var(--schedule-table-disclosure-width);
                border-radius: 999px;
                color: var(--secondary-text-color);
                font-size: 0.82rem;
                font-weight: 700;
                line-height: 1;
                transition: background-color 120ms ease, color 120ms ease;
            }

            .slot-disclosure-button:hover {
                background: color-mix(in srgb, var(--primary-color) 10%, transparent);
                color: var(--primary-color);
            }

            .slot-time-button.hour-child {
                padding: 4px 6px 4px 4px;
                font-size: 0.78rem;
            }

            .slot-time-label {
                display: inline-flex;
                align-items: baseline;
                min-width: 0;
                overflow: hidden;
                font-variant-numeric: tabular-nums;
            }

            .slot-time-label-leading,
            .slot-time-label-trailing {
                white-space: nowrap;
            }

            .slot-time-label-leading.hidden,
            .slot-time-label-trailing.hidden {
                visibility: hidden;
            }

            .slot-primary {
                grid-area: primary;
                display: grid;
                grid-template-columns: var(--schedule-table-action-chip-width) repeat(4, minmax(0, 1fr));
                align-items: stretch;
                column-gap: var(--schedule-table-forecast-gap);
                min-height: 24px;
                min-width: 0;
                overflow: hidden;
            }

            .slot-primary.with-appliances {
                grid-template-columns:
                    var(--schedule-table-action-chip-width)
                    minmax(0, var(--schedule-table-appliance-lane-width))
                    repeat(4, minmax(0, 1fr));
            }

            .slot-primary > *,
            .slot-runtime > * {
                min-width: 0;
            }

            .slot-primary .slot-action-button {
                align-self: center;
            }

            .slot-primary .slot-action-button {
                display: inline-flex;
                align-items: center;
                flex: 0 0 var(--schedule-table-action-chip-width);
                width: var(--schedule-table-action-chip-width);
                min-width: var(--schedule-table-action-chip-width);
                max-width: var(--schedule-table-action-chip-width);
                overflow: hidden;
                cursor: pointer;
                border-radius: 999px;
            }

            .slot-appliance-button {
                display: inline-flex;
                align-items: center;
                width: 100%;
                min-width: 0;
                min-height: 20px;
                border-radius: 999px;
                overflow: hidden;
                cursor: pointer;
            }

            .slot-appliance-button:hover:not(:disabled) {
                background: color-mix(in srgb, var(--primary-color) 6%, transparent);
            }

            .slot-action-button.single-action scheduling-action-chip {
                width: 100%;
                min-width: 0;
                max-width: 100%;
                flex: 1 1 auto;
            }

            .slot-action-button.multiple-actions {
                align-items: center;
            }

            .slot-action-pill-list {
                display: inline-flex;
                align-items: center;
                gap: 2px;
                min-width: 0;
                width: 100%;
                overflow: hidden;
            }

            .slot-action-pill-list scheduling-action-chip {
                flex: 1 1 0;
                min-width: 0;
                width: 0;
                max-width: 100%;
            }

            .slot-appliance-pill-list {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                min-width: 0;
                width: 100%;
                min-height: 20px;
                overflow: hidden;
            }

            .slot-appliance-pill-list.empty::before {
                content: "";
                display: block;
                min-height: 20px;
                width: 100%;
            }

            .slot-appliance-pill-list scheduling-appliance-chip {
                width: var(--schedule-table-action-chip-width);
                min-width: var(--schedule-table-action-chip-width);
                max-width: var(--schedule-table-action-chip-width);
                flex: 0 0 var(--schedule-table-action-chip-width);
            }

            .slot-runtime scheduling-action-chip {
                width: var(--schedule-table-action-chip-width);
                min-width: var(--schedule-table-action-chip-width);
                max-width: var(--schedule-table-action-chip-width);
                flex: 0 0 var(--schedule-table-action-chip-width);
            }

            .slot-runtime > .chip,
            .slot-runtime > .muted {
                flex: 0 1 auto;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .slot-action-button:hover:not(:disabled) scheduling-action-chip {
                filter: brightness(0.96);
            }

            .slot-action-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

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
                display: contents;
            }

            .slot-forecast-gauge {
                box-sizing: border-box;
                position: relative;
                display: inline-flex;
                align-items: center;
                overflow: hidden;
                width: 100%;
                min-width: 0;
                min-height: 20px;
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
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 16%, transparent),
                    color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 8%, transparent)
                );
                color: color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 34%, var(--primary-text-color));
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--simple-card-source-battery, #22c55e) 20%, var(--divider-color));
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
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-solar, #facc15) 12%, #201f1c),
                    color-mix(in srgb, var(--simple-card-source-solar, #facc15) 6%, #0f0f0e)
                );
                color: color-mix(in srgb, white 90%, var(--simple-card-source-solar, #facc15));
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--simple-card-source-solar, #facc15) 14%, #2d2b26);
                text-shadow: none;
            }

            .slot-forecast-gauge.solar .slot-forecast-gauge-fill {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-solar, #facc15) 44%, #332c00),
                    color-mix(in srgb, var(--simple-card-source-solar, #facc15) 32%, #1c1800)
                );
            }

            .slot-forecast-gauge.grid {
                justify-content: flex-end;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 13%, #141b25),
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 6%, #070b10),
                    color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 13%, #141b25)
                );
                color: color-mix(in srgb, var(--primary-text-color) 92%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--simple-card-source-grid, #38bdf8) 13%, #232d39);
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
                justify-content: flex-end;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--forecast-price-negative, #6d4c41) 12%, transparent),
                    color-mix(in srgb, var(--card-background-color) 88%, transparent),
                    color-mix(in srgb, var(--forecast-price-positive, #8d6e63) 12%, transparent)
                );
                color: color-mix(in srgb, var(--primary-text-color) 92%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--forecast-price-positive, #8d6e63) 18%, var(--divider-color));
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

            .slot-forecast-gauge.solar.zero {
                color: var(--secondary-text-color);
            }

            .slot-forecast-gauge.price.zero {
                color: var(--secondary-text-color);
            }

            .slot-forecast-gauge.grid.zero,
            .slot-forecast-gauge.price.zero,
            .slot-forecast-gauge.solar.zero {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--secondary-text-color) 14%, #0f0f10),
                    color-mix(in srgb, var(--secondary-text-color) 8%, #040404)
                );
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--secondary-text-color) 18%, #1b1b1c);
            }

            .slot-forecast-gauge.zero .slot-forecast-gauge-center {
                background: color-mix(in srgb, var(--secondary-text-color) 32%, transparent);
            }

            .slot-forecast-gauge.unavailable {
                opacity: 0.4;
            }

            .slot-children {
                display: flex;
                flex-direction: column;
            }
        `,
    ];

    private _selectedSet: ReadonlySet<string> = new Set();

    @property({ attribute: false }) public tableModel: ScheduleTableModel = EMPTY_SCHEDULE_TABLE_MODEL;
    @property({ attribute: false }) public selectedSlotIds: string[] = [];
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: Boolean }) public busy = false;
    @property({ type: Boolean }) public executionEnabled = false;

    protected willUpdate(changedProperties: PropertyValues<this>): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has("selectedSlotIds")) {
            this._selectedSet = new Set(this.selectedSlotIds);
        }
    }

    render() {
        return html`
            <div class="slot-table">
                ${this.tableModel.sections.map((section) => html`
                    ${this._renderDaySeparator(section)}
                    ${section.rows.map((row) => this._renderTableRow(row))}
                `)}
            </div>
        `;
    }

    private _renderDaySeparator(section: ScheduleTableSectionModel) {
        return html`
            <div class="day-separator">
                <div class="day-separator-label">${section.dayLabel}</div>
                <div class=${`day-separator-columns${this.tableModel.applianceLaneEnabled ? " with-appliances" : ""}`}>
                    <div class="day-separator-action">${this.localize("scheduling.table.action_label")}</div>
                    <div class="day-separator-forecast">
                        ${this._renderHeaderMetric("soc", this.localize("scheduling.table.soc_label"), "%")}
                        ${this._renderHeaderMetric("solar", this.localize("scheduling.table.solar_label"), "kWh")}
                        ${this._renderHeaderMetric("grid", this.localize("scheduling.table.grid_label"), "kWh")}
                        ${this._renderHeaderMetric("price", this.localize("scheduling.table.price_label"), this.tableModel.forecast.priceDisplayUnit ?? "")}
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

    private _renderTableRow(row: ScheduleTableRowModel) {
        return row.kind === "hour"
            ? this._renderHourRow(row)
            : this._renderSlotRow(row);
    }

    private _renderSlotRow(row: ScheduleTableSlotRowModel) {
        const slot = row.slot;
        const selected = this._selectedSet.has(slot.id);
        const classes = `slot-row${slot.isCurrent ? " current" : ""}${selected ? " selected" : ""}${row.variant === "hour-child" ? " hour-child" : ""}`;
        const timeButtonClasses = `button-reset slot-time-button${selected ? " selected" : ""}${slot.isCurrent ? " current" : ""}${row.variant === "hour-child" ? " hour-child" : ""}`;

        return html`
            <div class=${classes}>
                <div class="slot-time-group">
                    ${row.variant === "hour-child"
                        ? html`<span class="slot-time-indent" aria-hidden="true"></span>`
                        : nothing}
                    <button
                        class=${timeButtonClasses}
                        type="button"
                        ?disabled=${this.busy}
                        aria-label=${`${this.localize("scheduling.actions.select_slot")} ${row.rangeLabel}`}
                        aria-pressed=${selected ? "true" : "false"}
                        @click=${(event: MouseEvent) => this._handleTimeClick(slot.id, event)}
                    >
                        ${this._renderTimeLabel(row.displayTimeLabel)}
                    </button>
                </div>
                <div class=${`slot-primary${this.tableModel.applianceLaneEnabled ? " with-appliances" : ""}`}>
                    ${this._renderInverterActionButton(
                        row.actionCell,
                        row.rangeLabel,
                        slot.id,
                    )}
                    ${this.tableModel.applianceLaneEnabled
                        ? this._renderApplianceActionButton(row.actionCell, row.rangeLabel, slot.id)
                        : nothing}
                    ${this._renderForecastGauges(row.forecast)}
                </div>
                ${row.showRuntime ? html`
                    <div class="slot-runtime">${this._renderSlotRuntime(slot)}</div>
                ` : nothing}
            </div>
        `;
    }

    private _renderHourRow(row: ScheduleTableHourRowModel) {
        const selectedCount = row.slotIds.filter((slotId) => this._selectedSet.has(slotId)).length;
        const fullySelected = selectedCount === row.slotIds.length && row.slotIds.length > 0;
        const partiallySelected = selectedCount > 0 && !fullySelected;
        const current = row.runtimeSlot !== null;
        const classes = `slot-row${current ? " current" : ""}${fullySelected ? " selected" : ""}${partiallySelected ? " partially-selected" : ""}`;
        const timeButtonClasses = `button-reset slot-time-button${fullySelected ? " selected" : ""}${current ? " current" : ""}`;
        const actionLabel = this._buildActionCellLabel(row.actionCell);

        return html`
            <div class=${classes}>
                <div class="slot-time-group">
                    <button
                        class="button-reset slot-disclosure-button"
                        type="button"
                        aria-expanded=${row.expanded ? "true" : "false"}
                        aria-controls=${this._buildHourPanelId(row.hourKey)}
                        aria-label=${this._buildHourToggleAriaLabel(row)}
                        @click=${(event: MouseEvent) => this._handleHourExpansionClick(row.hourKey, event)}
                    >
                        ${row.expanded ? "−" : "+"}
                    </button>
                    <button
                        class=${timeButtonClasses}
                        type="button"
                        ?disabled=${this.busy}
                        aria-label=${`${this.localize("scheduling.actions.select_hour")} ${row.rangeLabel}`}
                        aria-pressed=${fullySelected ? "true" : "false"}
                        @click=${(event: MouseEvent) => this._handleTimeClick(row.slotIds[0], event, row.slotIds)}
                    >
                        ${this._renderTimeLabel(row.displayTimeLabel)}
                    </button>
                </div>
                <div class=${`slot-primary${this.tableModel.applianceLaneEnabled ? " with-appliances" : ""}`}>
                    ${this._renderInverterActionButton(
                        row.actionCell,
                        row.rangeLabel,
                        row.slotIds[0],
                        row.slotIds,
                    )}
                    ${this.tableModel.applianceLaneEnabled
                        ? this._renderApplianceActionButton(
                            row.actionCell,
                            row.rangeLabel,
                            row.slotIds[0],
                            row.slotIds,
                        )
                        : nothing}
                    ${this._renderForecastGauges(row.forecast)}
                </div>
                ${row.runtimeSlot ? html`
                    <div class="slot-runtime">${this._renderSlotRuntime(row.runtimeSlot)}</div>
                ` : nothing}
            </div>
            ${row.expanded ? html`
                <div id=${this._buildHourPanelId(row.hourKey)} class="slot-children">
                    ${row.childRows.map((childRow) => this._renderSlotRow(childRow))}
                </div>
            ` : nothing}
        `;
    }

    private _renderInverterActionButton(
        actionCell: ScheduleTableActionCellModel,
        rangeLabel: string,
        slotId: string,
        slotIds?: readonly string[],
    ) {
        const classes = `button-reset slot-action-button${actionCell.inverterPills.length > 1 ? " multiple-actions" : " single-action"}`;
        const ariaLabel = `${this.localize("scheduling.table.action_label")} ${rangeLabel}. ${actionCell.inverterPills
            .map((pill) => getScheduleActionLabel(pill.action, this.localize))
            .join(", ")}`;
        return html`
            <button
                class=${classes}
                type="button"
                ?disabled=${this.busy}
                aria-label=${ariaLabel}
                @click=${() => this._handleActionClick(slotId, slotIds)}
            >
                ${actionCell.inverterPills.length === 1
                    ? html`
                        <scheduling-action-chip
                            .action=${actionCell.inverterPills[0].action}
                            .localize=${this.localize}
                            .labelVariant=${"table"}
                            size="compact"
                            ?iconOnly=${true}
                        ></scheduling-action-chip>
                    `
                    : html`
                        <span class="slot-action-pill-list">
                            ${actionCell.inverterPills.map((pill) => html`
                                <scheduling-action-chip
                                    .action=${pill.action}
                                    .localize=${this.localize}
                                    .labelVariant=${"table"}
                                    size="compact"
                                    ?iconOnly=${true}
                                ></scheduling-action-chip>
                            `)}
                        </span>
                    `}
            </button>
        `;
    }

    private _renderApplianceActionButton(
        actionCell: ScheduleTableActionCellModel,
        rangeLabel: string,
        slotId: string,
        slotIds?: readonly string[],
    ) {
        const ariaLabel = `${this.localize("scheduling.table.action_label")} ${rangeLabel}${actionCell.appliancePills.length > 0
            ? `. ${this._buildAppliancePillLabelList(actionCell.appliancePills)}`
            : ""}`;
        return html`
            <button
                class="button-reset slot-appliance-button"
                type="button"
                ?disabled=${this.busy}
                aria-label=${ariaLabel}
                @click=${() => this._handleActionClick(slotId, slotIds)}
            >
                <span class=${`slot-appliance-pill-list${actionCell.appliancePills.length === 0 ? " empty" : ""}`}>
                    ${actionCell.appliancePills.map((pill) => html`
                        <scheduling-appliance-chip
                            .appliance=${{
                                id: pill.applianceId,
                                name: pill.applianceName,
                                kind: pill.applianceKind,
                                order: 0,
                                supportsAuthoring: false,
                            }}
                            .action=${pill.action}
                            .localize=${this.localize}
                            size="compact"
                            ?iconOnly=${true}
                        ></scheduling-appliance-chip>
                    `)}
                </span>
            </button>
        `;
    }

    private _renderTimeLabel(label: ScheduleTableSlotRowModel["displayTimeLabel"]) {
        return html`
            <span class="slot-time-label">
                ${label.leading
                    ? html`
                        <span class=${`slot-time-label-leading${label.hideLeading ? " hidden" : ""}`}>
                            ${label.leading}
                        </span>
                    `
                    : nothing}
                <span>${label.primary}</span>
                ${label.trailing
                    ? html`
                        <span class=${`slot-time-label-trailing${label.hideTrailing ? " hidden" : ""}`}>
                            ${label.trailing}
                        </span>
                    `
                    : nothing}
            </span>
        `;
    }

    private _renderForecastGauges(point: SlotForecastPoint | null) {
        const forecast = this.tableModel.forecast;
        if (
            !forecast.batteryAvailable
            && !forecast.solarAvailable
            && !forecast.gridAvailable
            && !forecast.priceAvailable
        ) {
            return nothing;
        }

        return html`
            <div class="slot-forecast">
                ${this._renderGauge(
                    "battery",
                    forecast.batteryAvailable,
                    point?.socPct ?? null,
                    100,
                )}
                ${this._renderGauge(
                    "solar",
                    forecast.solarAvailable,
                    point?.solarWh ?? null,
                    forecast.solarMaxWh,
                )}
                ${this._renderGridGauge(point, forecast)}
                ${this._renderPriceGauge(point, forecast)}
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

        const hideLabel = type === "battery"
            ? value <= 0
            : _isZeroSolarDisplayValue(value);
        const isZero = type === "solar" && hideLabel;
        const widthPct = maxValue > 0 && !hideLabel
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
                ${!hideLabel && label !== null ? html`<span class="slot-forecast-gauge-text">${label}</span>` : nothing}
            </div>
        `;
    }

    private _renderGridGauge(
        point: SlotForecastPoint | null,
        forecast: ScheduleTableModel["forecast"],
    ) {
        if (!forecast.gridAvailable || point?.gridNetKwh === null || point?.gridNetKwh === undefined) {
            return html`
                <div class="slot-forecast-gauge grid unavailable" aria-hidden="true">
                </div>
            `;
        }

        const importValue = point.gridImportKwh ?? 0;
        const exportValue = point.gridExportKwh ?? 0;
        const hasImport = !_isZeroKwhDisplayValue(importValue);
        const hasExport = !_isZeroKwhDisplayValue(exportValue);
        const isZero = !hasImport && !hasExport && _isZeroKwhDisplayValue(point.gridNetKwh);
        const displayValue = _isZeroKwhDisplayValue(point.gridNetKwh) ? 0 : point.gridNetKwh;
        const importWidthPct = forecast.gridMaxAbsKwh > 0 && hasImport
            ? Math.min((importValue / forecast.gridMaxAbsKwh) * 50, 50)
            : 0;
        const exportWidthPct = forecast.gridMaxAbsKwh > 0 && hasExport
            ? Math.min((exportValue / forecast.gridMaxAbsKwh) * 50, 50)
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
                ${importWidthPct > 0 ? html`
                    <span
                        class="slot-forecast-gauge-fill import"
                        style=${`width:${importWidthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                ${exportWidthPct > 0 ? html`
                    <span
                        class="slot-forecast-gauge-fill export"
                        style=${`width:${exportWidthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                ${!isZero ? html`
                    <span class="slot-forecast-gauge-text">${this._formatVisibleGridNet(displayValue)}</span>
                ` : nothing}
            </div>
        `;
    }

    private _renderPriceGauge(
        point: SlotForecastPoint | null,
        forecast: ScheduleTableModel["forecast"],
    ) {
        if (!forecast.priceAvailable || !point || point.price === null) {
            return html`
                <div class="slot-forecast-gauge price zero" aria-hidden="true">
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
        const widthPct = forecast.priceMaxAbs > 0 && direction !== null
            ? Math.min((Math.abs(displayValue) / forecast.priceMaxAbs) * 50, 50)
            : 0;

        return html`
            <div
                class=${`slot-forecast-gauge price${isZero ? " zero" : ""}`}
                role="img"
                aria-label=${this._buildPriceGaugeTitle(displayValue, forecast.priceDisplayUnit)}
                title=${this._buildPriceGaugeTitle(displayValue, forecast.priceDisplayUnit)}
            >
                <span class="slot-forecast-gauge-center" aria-hidden="true"></span>
                ${direction !== null && widthPct > 0 ? html`
                    <span
                        class=${`slot-forecast-gauge-fill ${direction}`}
                        style=${`width:${widthPct}%;`}
                        aria-hidden="true"
                    ></span>
                ` : nothing}
                ${!isZero ? html`
                    <span class="slot-forecast-gauge-text">${_formatVisiblePriceValue(displayValue)}</span>
                ` : nothing}
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
        action: ScheduleSlot["domains"]["inverter"],
        runtimeState: "following" | "diverged" | "error",
    ) {
        return html`
            <scheduling-action-chip
                .action=${action}
                .localize=${this.localize}
                .labelVariant=${"table"}
                size="compact"
                surface="runtime"
                .runtimeState=${runtimeState}
                ?iconOnly=${true}
            ></scheduling-action-chip>
        `;
    }

    private _getRuntimeState(slot: ScheduleSlot): "following" | "diverged" | "error" {
        const runtime = slot.runtime;
        if (runtime === null || runtime.status === "error") {
            return runtime?.status === "error" ? "error" : "diverged";
        }

        if (runtime.executedAction) {
            return areScheduleActionsEqual(slot.domains.inverter, runtime.executedAction)
                ? "following"
                : "diverged";
        }

        return runtime.reason === "scheduled" ? "following" : "diverged";
    }

    private _buildActionCellLabel(actionCell: ScheduleTableActionCellModel): string {
        const inverterLabels = actionCell.inverterPills
            .map((pill) => getScheduleActionLabel(pill.action, this.localize));
        const applianceLabels = actionCell.appliancePills
            .map((pill) => this._buildAppliancePillLabel(pill));
        return [...inverterLabels, ...applianceLabels].join(", ");
    }

    private _buildAppliancePillLabel(pill: ScheduleTableAppliancePillModel): string {
        const presentation = getScheduleApplianceActionPresentation({
            appliance: { kind: pill.applianceKind },
            action: pill.action,
            localize: this.localize,
        });
        return `${pill.applianceName} · ${presentation.label}`;
    }

    private _buildAppliancePillLabelList(
        pills: readonly ScheduleTableAppliancePillModel[],
    ): string {
        return pills.map((pill) => this._buildAppliancePillLabel(pill)).join(", ");
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

    private _buildHourPanelId(hourKey: string): string {
        return `schedule-hour-panel-${hourKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    }

    private _buildHourToggleAriaLabel(row: ScheduleTableHourRowModel): string {
        return `${this.localize(
            row.expanded ? "scheduling.actions.collapse_hour" : "scheduling.actions.expand_hour",
        )} ${row.rangeLabel}`;
    }

    private _handleTimeClick(slotId: string, event: MouseEvent, slotIds?: readonly string[]): void {
        if (this.busy) {
            return;
        }

        this.dispatchEvent(new CustomEvent("toggle-schedule-slot-selection", {
            bubbles: true,
            composed: true,
            detail: {
                slotId,
                slotIds: slotIds ? [...slotIds] : undefined,
                shiftKey: event.shiftKey,
            } satisfies ScheduleSlotToggleDetail,
        }));
    }

    private _handleActionClick(slotId: string, slotIds?: readonly string[]): void {
        if (this.busy) {
            return;
        }

        this.dispatchEvent(new CustomEvent("open-schedule-dialog", {
            bubbles: true,
            composed: true,
            detail: {
                slotId,
                slotIds: slotIds ? [...slotIds] : undefined,
            } satisfies ScheduleDialogOpenDetail,
        }));
    }

    private _handleHourExpansionClick(hourKey: string, event: MouseEvent): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("toggle-schedule-hour-expansion", {
            bubbles: true,
            composed: true,
            detail: { hourKey } satisfies ScheduleHourToggleDetail,
        }));
    }
}
