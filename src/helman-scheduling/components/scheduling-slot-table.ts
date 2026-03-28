import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import {
    getScheduleActionLabel,
    getScheduleErrorLabel,
    getScheduleReasonLabel,
} from "../model/schedule-labels";
import {
    EMPTY_SLOT_FORECAST_MAP,
    type SlotForecastMap,
} from "../model/slot-forecast-model";
import type {
    ScheduleDialogOpenDetail,
    ScheduleSlot,
    ScheduleSlotToggleDetail,
    ScheduleTableSectionModel,
} from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

function _formatSolarLabel(wh: number): string {
    const kwh = wh / 1000;
    return kwh >= 10 ? `${Math.round(kwh)} kWh` : `${kwh.toFixed(1)} kWh`;
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
                padding: 6px 4px;
                color: var(--secondary-text-color);
                font-size: 0.78rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                background: var(--card-background-color);
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
                flex-wrap: wrap;
                align-items: center;
                gap: 3px;
                min-height: 24px;
                min-width: 0;
            }

            .slot-primary .slot-action-button.chip {
                cursor: pointer;
                min-height: 20px;
                padding: 2px 6px;
            }

            .slot-action-button:hover:not(:disabled) {
                background: color-mix(in srgb, var(--primary-color) 22%, transparent);
            }

            .slot-action-button:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .slot-primary .chip,
            .slot-runtime .chip {
                min-height: 16px;
                padding: 1px 4px;
                font-size: 0.75rem;
                line-height: 1.1;
            }

            .slot-runtime {
                grid-area: runtime;
                display: flex;
                flex-wrap: wrap;
                gap: 2px;
                align-items: center;
                min-width: 0;
                padding-bottom: 1px;
            }

            .slot-runtime .muted {
                font-size: 0.78rem;
                line-height: 1.1;
            }

            .slot-forecast {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-inline-start: auto;
                min-width: 0;
            }

            .forecast-gauge {
                display: flex;
                align-items: center;
                gap: 2px;
                min-width: 0;
            }

            .forecast-bar-track {
                width: 36px;
                height: 3px;
                border-radius: 2px;
                background: color-mix(in srgb, var(--secondary-text-color) 20%, transparent);
                overflow: hidden;
                flex-shrink: 0;
            }

            .forecast-bar-fill {
                height: 100%;
                border-radius: 2px;
            }

            .forecast-gauge.battery .forecast-bar-fill {
                background: var(--simple-card-source-battery, #22c55e);
            }

            .forecast-gauge.solar .forecast-bar-fill {
                background: #f5b912;
            }

            .forecast-gauge.unavailable .forecast-bar-track {
                opacity: 0.4;
            }

            .forecast-label {
                font-size: 0.68rem;
                font-weight: 600;
                color: var(--secondary-text-color);
                line-height: 1.1;
                white-space: nowrap;
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
                    <div class="day-separator">${section.dayLabel}</div>
                    ${section.slots.map((slot) => this._renderSlotRow(slot))}
                `)}
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
                    @click=${() => this._handleTimeClick(slot.id)}
                >
                    ${slot.rangeLabel}
                </button>
                <div class="slot-primary">
                    <button
                        class="button-reset chip action slot-action-button"
                        type="button"
                        ?disabled=${this.busy}
                        aria-label=${`${getScheduleActionLabel(slot.action, this.localize)} ${slot.rangeLabel}`}
                        @click=${() => this._handleActionClick(slot.id)}
                    >
                        ${getScheduleActionLabel(slot.action, this.localize)}
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
                    point?.socPct != null ? `${Math.round(point.socPct)}%` : null,
                )}
                ${this._renderGauge(
                    "solar",
                    map.solarAvailable,
                    point?.solarWh ?? null,
                    map.solarMaxWh,
                    point?.solarWh != null ? _formatSolarLabel(point.solarWh) : null,
                )}
            </div>
        `;
    }

    private _renderGauge(
        type: string,
        available: boolean,
        value: number | null,
        maxValue: number,
        label: string | null,
    ) {
        if (!available) {
            return html`
                <div class="forecast-gauge ${type} unavailable">
                    <div class="forecast-bar-track"></div>
                </div>
            `;
        }

        const widthPct = value !== null && maxValue > 0
            ? Math.min((value / maxValue) * 100, 100)
            : 0;

        return html`
            <div class="forecast-gauge ${type}">
                <div class="forecast-bar-track">
                    <div class="forecast-bar-fill" style="width:${widthPct}%"></div>
                </div>
                ${label !== null ? html`<span class="forecast-label">${label}</span>` : nothing}
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
                    <div class="chip runtime">
                        ${getScheduleActionLabel(slot.runtime.executedAction, this.localize)}
                    </div>
                ` : nothing}
                ${reasonLabel ? html`<div class="chip reason">${reasonLabel}</div>` : nothing}
            `;
        }

        return html`
            <div class="chip runtime">
                ${slot.runtime.executedAction
                    ? getScheduleActionLabel(slot.runtime.executedAction, this.localize)
                    : this.localize("scheduling.runtime.applied")}
            </div>
            ${reasonLabel ? html`<div class="chip reason">${reasonLabel}</div>` : nothing}
        `;
    }

    private _handleTimeClick(slotId: string): void {
        if (this.busy) {
            return;
        }

        this.dispatchEvent(new CustomEvent("toggle-schedule-slot-selection", {
            bubbles: true,
            composed: true,
            detail: { slotId } satisfies ScheduleSlotToggleDetail,
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
