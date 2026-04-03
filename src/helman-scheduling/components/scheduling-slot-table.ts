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
import type { SlotForecastPoint } from "../model/slot-forecast-model";
import {
    EMPTY_SCHEDULE_TABLE_MODEL,
    type ScheduleHourToggleDetail,
    type ScheduleTableActionCellModel,
    type ScheduleTableActionItemModel,
    type ScheduleTableColumnKey,
    type ScheduleTableDetailRowModel,
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
                --schedule-table-disclosure-width: 16px;
                --schedule-table-metric-column-width: 82px;
            }

            .table-shell {
                min-width: 0;
            }

            .schedule-table {
                width: 100%;
                min-width: 0;
                border-collapse: separate;
                border-spacing: 0 1px;
                table-layout: auto;
            }

            .schedule-table col.col-time {
                width: 1%;
            }

            .schedule-table col.col-action {
                width: 1%;
            }

            .schedule-table col.col-soc,
            .schedule-table col.col-solar,
            .schedule-table col.col-grid,
            .schedule-table col.col-price {
                width: var(--schedule-table-metric-column-width);
            }

            .schedule-table caption {
                padding: 0;
            }

            .column-header-row th,
            .day-row th,
            .schedule-row > *,
            .detail-row > * {
                box-sizing: border-box;
            }

            .column-header-row th {
                padding: 6px 4px;
                color: var(--secondary-text-color);
                font-size: 0.78rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                background: var(--card-background-color);
                text-align: left;
                white-space: nowrap;
            }

            .column-header-row th.metric-column {
                padding: 6px 2px;
                text-align: center;
            }

            .column-header-title {
                display: block;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 0.72rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .column-header-unit {
                display: block;
                font-size: 0.62rem;
                font-weight: 600;
                letter-spacing: normal;
                text-transform: none;
            }

            .day-row th {
                padding: 8px 4px 4px;
                color: var(--secondary-text-color);
                font-size: 0.78rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                background: var(--card-background-color);
                text-align: left;
            }

            .schedule-row > *,
            .detail-row > * {
                vertical-align: middle;
            }

            .schedule-row > * {
                padding: 0 4px;
                background: transparent;
                transition: background-color 120ms ease, box-shadow 120ms ease;
            }

            .schedule-row:hover > * {
                background: color-mix(in srgb, var(--primary-color) 5%, transparent);
            }

            .schedule-row.selected > * {
                background: color-mix(in srgb, var(--primary-color) 8%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 36%, transparent);
            }

            .schedule-row.partially-selected > * {
                background: color-mix(in srgb, var(--primary-color) 5%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent);
            }

            .schedule-row.hour-child > * {
                background: color-mix(in srgb, var(--secondary-text-color) 6%, transparent);
            }

            .schedule-row.hour-child:hover > * {
                background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background-color));
            }

            .schedule-row > *:first-child,
            .detail-row > *:first-child {
                border-top-left-radius: 10px;
                border-bottom-left-radius: 10px;
            }

            .schedule-row > *:last-child,
            .detail-row > *:last-child {
                border-top-right-radius: 10px;
                border-bottom-right-radius: 10px;
            }

            .time-cell {
                width: 1%;
                padding-left: 6px;
                padding-right: 6px;
                font-weight: normal;
                text-align: left;
                white-space: nowrap;
            }

            .time-cell-content {
                display: inline-flex;
                align-items: center;
                gap: 0;
                min-width: 0;
                width: 100%;
            }

            .time-indent {
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

            .time-button {
                display: inline-flex;
                align-items: center;
                justify-content: flex-start;
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

            .time-button:hover:not(:disabled) {
                background: color-mix(in srgb, var(--primary-color) 12%, transparent);
            }

            .time-button.selected {
                background: color-mix(in srgb, var(--primary-color) 18%, var(--card-background-color));
                color: var(--primary-color);
            }

            .time-button.current.selected {
                background: color-mix(in srgb, var(--primary-color) 24%, var(--card-background-color));
            }

            .time-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .time-button.hour-child {
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

            .action-cell {
                width: 1%;
                min-width: 0;
                padding: 0 4px;
                white-space: nowrap;
            }

            .action-button {
                display: inline-flex;
                align-items: center;
                width: auto;
                max-width: 100%;
                min-width: 0;
                min-height: 24px;
                padding: 2px 4px;
                border-radius: 10px;
                overflow: hidden;
                cursor: pointer;
            }

            .action-button:hover:not(:disabled) {
                background: color-mix(in srgb, var(--primary-color) 6%, transparent);
            }

            .action-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .action-pill-list {
                display: flex;
                align-items: center;
                gap: 4px;
                min-width: 0;
                width: auto;
                overflow: hidden;
                white-space: nowrap;
            }

            .action-pill-list scheduling-action-chip,
            .action-pill-list scheduling-appliance-chip {
                flex: 0 0 auto;
            }

            .forecast-cell {
                min-width: 0;
                padding: 0 4px;
            }

            .detail-row > * {
                padding: 0 4px;
                background: color-mix(in srgb, var(--primary-color) 4%, transparent);
                vertical-align: top;
            }

            .detail-row.hour-child > * {
                background: color-mix(in srgb, var(--secondary-text-color) 5%, transparent);
            }

            .detail-spacer {
                width: 1%;
            }

            .detail-cell {
                min-width: 0;
            }

            .slot-runtime {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: center;
                min-width: 0;
            }

            .slot-runtime scheduling-action-chip {
                flex: 0 0 auto;
            }

            .slot-runtime > .chip,
            .slot-runtime > .muted {
                flex: 0 1 auto;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .slot-runtime .chip {
                min-height: 16px;
                padding: 1px 4px;
                font-size: 0.75rem;
                line-height: 1.1;
            }

            .slot-runtime .muted {
                font-size: 0.78rem;
                line-height: 1.1;
            }

            .slot-forecast-gauge {
                box-sizing: border-box;
                position: relative;
                display: flex;
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

            .slot-forecast-gauge.solar.zero,
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

            @media (max-width: 720px) {
                :host {
                    --schedule-table-metric-column-width: 68px;
                }

                .column-header-row th {
                    padding: 5px 3px;
                    font-size: 0.72rem;
                }

                .day-row th {
                    padding: 7px 3px 3px;
                    font-size: 0.74rem;
                }

                .time-button {
                    font-size: 0.8rem;
                }

                .action-pill-list {
                    gap: 2px;
                    flex-wrap: wrap;
                    white-space: normal;
                }

                .slot-forecast-gauge {
                    min-height: 18px;
                    padding: 1px 3px 1px 4px;
                    font-size: 0.64rem;
                }

                .slot-runtime {
                    gap: 3px;
                }
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
            <div class="table-shell">
                <table class="schedule-table">
                    <caption class="sr-only">${this.localize("scheduling.title_default")}</caption>
                    <colgroup>
                        ${this.tableModel.columns.map((column) => html`
                            <col class=${`col-${column}`}></col>
                        `)}
                    </colgroup>
                    ${this._renderTableHeader()}
                    ${this.tableModel.sections.map((section) => this._renderSection(section))}
                </table>
            </div>
        `;
    }

    private _renderTableHeader() {
        return html`
            <thead>
                <tr class="column-header-row">
                    ${this.tableModel.columns.map((column) => this._renderColumnHeader(column))}
                </tr>
            </thead>
        `;
    }

    private _renderColumnHeader(column: ScheduleTableColumnKey) {
        switch (column) {
            case "time":
                return html`
                    <th scope="col">${this.localize("scheduling.table.time_label")}</th>
                `;
            case "action":
                return html`
                    <th scope="col">${this.localize("scheduling.table.action_label")}</th>
                `;
            case "soc":
                return this._renderMetricHeader(column, this.localize("scheduling.table.soc_label"), "%");
            case "solar":
                return this._renderMetricHeader(column, this.localize("scheduling.table.solar_label"), "kWh");
            case "grid":
                return this._renderMetricHeader(column, this.localize("scheduling.table.grid_label"), "kWh");
            case "price":
                return this._renderMetricHeader(
                    column,
                    this.localize("scheduling.table.price_label"),
                    this.tableModel.forecast.priceDisplayUnit ?? "",
                );
        }
    }

    private _renderMetricHeader(column: "soc" | "solar" | "grid" | "price", title: string, unit: string) {
        return html`
            <th scope="col" class=${`metric-column ${column}`}>
                <span class="column-header-title">${title}</span>
                <span class="column-header-unit">${unit}</span>
            </th>
        `;
    }

    private _renderSection(section: ScheduleTableSectionModel) {
        const headerId = this._buildDayHeaderId(section.dayKey);
        return html`
            <tbody aria-labelledby=${headerId}>
                <tr class="day-row">
                    <th id=${headerId} scope="rowgroup" colspan=${this.tableModel.columns.length}>
                        ${section.dayLabel}
                    </th>
                </tr>
                ${section.rows.map((row) => this._renderTableRow(row))}
            </tbody>
        `;
    }

    private _renderTableRow(row: ScheduleTableRowModel) {
        switch (row.kind) {
            case "detail":
                return this._renderDetailRow(row);
            case "hour":
                return this._renderHourRow(row);
            case "slot":
                return this._renderSlotRow(row);
        }
    }

    private _renderSlotRow(row: ScheduleTableSlotRowModel) {
        const selected = this._selectedSet.has(row.slot.id);
        const classes = `schedule-row slot-row${row.isCurrent ? " current" : ""}${selected ? " selected" : ""}${row.variant === "hour-child" ? " hour-child" : ""}`;
        const timeButtonClasses = `button-reset time-button${selected ? " selected" : ""}${row.isCurrent ? " current" : ""}${row.variant === "hour-child" ? " hour-child" : ""}`;

        return html`
            <tr class=${classes}>
                <th scope="row" class="time-cell">
                    <div class="time-cell-content">
                        ${row.variant === "hour-child"
                            ? html`<span class="time-indent" aria-hidden="true"></span>`
                            : nothing}
                        <button
                            class=${timeButtonClasses}
                            type="button"
                            ?disabled=${this.busy}
                            aria-label=${`${this.localize("scheduling.actions.select_slot")} ${row.rangeLabel}`}
                            aria-pressed=${selected ? "true" : "false"}
                            @click=${(event: MouseEvent) => this._handleTimeClick(row.slot.id, event)}
                        >
                            ${this._renderTimeLabel(row.displayTimeLabel)}
                        </button>
                    </div>
                </th>
                ${this._renderActionCell(row.actionCell, row.rangeLabel, row.slot.id)}
                ${this._renderForecastCells(row.forecast)}
            </tr>
        `;
    }

    private _renderHourRow(row: ScheduleTableHourRowModel) {
        const selectedCount = row.slotIds.filter((slotId) => this._selectedSet.has(slotId)).length;
        const fullySelected = selectedCount === row.slotIds.length && row.slotIds.length > 0;
        const partiallySelected = selectedCount > 0 && !fullySelected;
        const classes = `schedule-row hour-row${row.isCurrent ? " current" : ""}${fullySelected ? " selected" : ""}${partiallySelected ? " partially-selected" : ""}`;
        const timeButtonClasses = `button-reset time-button${fullySelected ? " selected" : ""}${row.isCurrent ? " current" : ""}`;

        return html`
            <tr class=${classes}>
                <th scope="row" class="time-cell">
                    <div class="time-cell-content">
                        <button
                            class="button-reset slot-disclosure-button"
                            type="button"
                            aria-expanded=${row.expanded ? "true" : "false"}
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
                </th>
                ${this._renderActionCell(row.actionCell, row.rangeLabel, row.slotIds[0], row.slotIds)}
                ${this._renderForecastCells(row.forecast)}
            </tr>
        `;
    }

    private _renderDetailRow(row: ScheduleTableDetailRowModel) {
        return html`
            <tr class=${`detail-row ${row.variant}`}>
                <td class="detail-spacer" aria-hidden="true"></td>
                <td class="detail-cell" colspan=${this.tableModel.columns.length - 1}>
                    <div class="slot-runtime">${this._renderSlotRuntime(row.slot)}</div>
                </td>
            </tr>
        `;
    }

    private _renderActionCell(
        actionCell: ScheduleTableActionCellModel,
        rangeLabel: string,
        slotId: string,
        slotIds?: readonly string[],
    ) {
        const actionLabel = this._buildActionCellLabel(actionCell);
        const ariaLabel = actionLabel.length > 0
            ? `${this.localize("scheduling.table.action_label")} ${rangeLabel}. ${actionLabel}`
            : `${this.localize("scheduling.table.action_label")} ${rangeLabel}`;

        return html`
            <td class="action-cell">
                <button
                    class="button-reset action-button"
                    type="button"
                    ?disabled=${this.busy}
                    aria-label=${ariaLabel}
                    @click=${() => this._handleActionClick(slotId, slotIds)}
                >
                    <span class="action-pill-list">
                        ${actionCell.items.map((item) => this._renderActionItem(item))}
                    </span>
                </button>
            </td>
        `;
    }

    private _renderActionItem(item: ScheduleTableActionItemModel) {
        if (item.kind === "inverter") {
            return html`
                <scheduling-action-chip
                    .action=${item.action}
                    .localize=${this.localize}
                    .labelVariant=${"table"}
                    size="compact"
                    ?iconOnly=${true}
                ></scheduling-action-chip>
            `;
        }

        return html`
            <scheduling-appliance-chip
                .appliance=${{
                    id: item.applianceId,
                    name: item.applianceName,
                    kind: item.applianceKind,
                    order: 0,
                    supportsAuthoring: false,
                }}
                .action=${item.action}
                .localize=${this.localize}
                size="compact"
                ?iconOnly=${true}
            ></scheduling-appliance-chip>
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

    private _renderForecastCells(point: SlotForecastPoint | null) {
        const forecast = this.tableModel.forecast;
        return [
            html`
                <td class="forecast-cell battery-cell">
                    ${this._renderGauge("battery", forecast.batteryAvailable, point?.socPct ?? null, 100)}
                </td>
            `,
            html`
                <td class="forecast-cell solar-cell">
                    ${this._renderGauge("solar", forecast.solarAvailable, point?.solarWh ?? null, forecast.solarMaxWh)}
                </td>
            `,
            html`
                <td class="forecast-cell grid-cell">
                    ${this._renderGridGauge(point, forecast)}
                </td>
            `,
            html`
                <td class="forecast-cell price-cell">
                    ${this._renderPriceGauge(point, forecast)}
                </td>
            `,
        ];
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
        return actionCell.items.map((item) => this._buildActionItemLabel(item)).join(", ");
    }

    private _buildActionItemLabel(item: ScheduleTableActionItemModel): string {
        if (item.kind === "inverter") {
            return getScheduleActionLabel(item.action, this.localize);
        }

        const presentation = getScheduleApplianceActionPresentation({
            appliance: { kind: item.applianceKind },
            action: item.action,
            localize: this.localize,
        });
        return `${item.applianceName} · ${presentation.label}`;
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

    private _buildHourToggleAriaLabel(row: ScheduleTableHourRowModel): string {
        return `${this.localize(
            row.expanded ? "scheduling.actions.collapse_hour" : "scheduling.actions.expand_hour",
        )} ${row.rangeLabel}`;
    }

    private _buildDayHeaderId(dayKey: string): string {
        return `schedule-day-${dayKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
