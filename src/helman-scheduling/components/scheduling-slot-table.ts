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
} from "../model/slot-forecast-model";
import type {
    ScheduleDialogOpenDetail,
    ScheduleSlot,
    ScheduleSlotToggleDetail,
    ScheduleTableSectionModel,
} from "../schedule-types";
import { areScheduleActionsEqual } from "../schedule-types";
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
                align-items: stretch;
                gap: 3px;
                min-height: 24px;
                min-width: 0;
            }

            .slot-primary .slot-action-button,
            .slot-primary > .chip.now {
                align-self: center;
            }

            .slot-primary .slot-action-button {
                display: inline-flex;
                align-items: center;
                min-width: 0;
                cursor: pointer;
                border-radius: 999px;
            }

            .slot-action-button scheduling-action-chip {
                max-width: 100%;
            }

            .slot-runtime scheduling-action-chip {
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
                align-items: stretch;
                align-self: stretch;
                flex: 0 1 auto;
                gap: 4px;
                margin-inline-start: auto;
                min-width: 0;
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

            .slot-forecast-gauge > :not(.slot-forecast-gauge-fill) {
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
                    @click=${(event: MouseEvent) => this._handleTimeClick(slot.id, event)}
                >
                    ${slot.rangeLabel}
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
        type: "battery" | "solar",
        available: boolean,
        value: number | null,
        maxValue: number,
        label: string | null,
    ) {
        if (!available || value === null) {
            return html`
                <div class="slot-forecast-gauge ${type} unavailable" aria-hidden="true">
                </div>
            `;
        }

        const widthPct = maxValue > 0
            ? Math.min((value / maxValue) * 100, 100)
            : 0;

        return html`
            <div class="slot-forecast-gauge ${type}">
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
