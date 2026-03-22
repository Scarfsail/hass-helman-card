import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import {
    formatScheduleSlotCount,
    getScheduleActionLabel,
    getScheduleErrorLabel,
    getScheduleReasonLabel,
} from "../model/schedule-labels";
import type {
    ScheduleIntervalRowModel,
    ScheduleOpenDialogDetail,
    ScheduleSlot,
    ScheduleSlotSelectionDetail,
    ScheduleIntervalSelectionDetail,
} from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

@customElement("scheduling-interval-row")
export class SchedulingIntervalRow extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .interval-card {
                gap: 0;
                padding: 0;
                overflow: hidden;
            }

            .interval-summary {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 8px 10px;
                cursor: pointer;
                text-align: left;
            }

            .interval-summary-left {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
                flex-wrap: nowrap;
            }

            .interval-time {
                font-size: 0.88rem;
                font-weight: 700;
                line-height: 1.2;
                white-space: nowrap;
            }

            .interval-summary-right {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
                min-width: 0;
                white-space: nowrap;
            }

            .interval-summary-left .chip,
            .interval-summary-right .chip {
                min-height: 20px;
                padding: 2px 6px;
                font-size: 0.76rem;
            }

            .interval-summary-right .muted {
                font-size: 0.78rem;
                line-height: 1.2;
            }

            .interval-chevron {
                color: var(--secondary-text-color);
                font-size: 0.8rem;
            }

            .interval-detail {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 0 10px 10px;
                border-top: 1px solid var(--divider-color);
            }

            .interval-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding-top: 8px;
            }

            .slot-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .slot-row {
                display: grid;
                grid-template-columns: auto minmax(0, 1fr);
                grid-template-areas:
                    "selection primary"
                    ". runtime";
                align-items: center;
                column-gap: 6px;
                row-gap: 2px;
                padding: 0 6px;
                border-radius: 6px;
                background: var(--card-background-color);
            }

            .slot-row.current {
                outline: 1px solid color-mix(in srgb, var(--primary-color) 38%, var(--divider-color));
            }

            .slot-selection {
                grid-area: selection;
                display: flex;
                align-items: center;
                align-self: center;
            }

            .slot-selection ha-checkbox {
                display: block;
            }

            .interval-select-all {
                color: var(--secondary-text-color);
            }

            .slot-primary {
                grid-area: primary;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 3px;
                min-height: 18px;
                min-width: 0;
            }

            .slot-time {
                min-width: 40px;
                font-weight: 600;
                line-height: 1.2;
            }

            .slot-runtime {
                grid-area: runtime;
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                align-items: center;
                min-width: 0;
            }

            .slot-primary .chip,
            .slot-runtime .chip {
                min-height: 18px;
                padding: 1px 5px;
            }

            .slot-runtime .muted {
                line-height: 1.2;
            }
        `,
    ];

    @property({ attribute: false }) public row!: ScheduleIntervalRowModel;
    @property({ type: Boolean }) public expanded = false;
    @property({ attribute: false }) public selectedSlotIds: string[] = [];
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: Boolean }) public busy = false;
    @property({ type: Boolean }) public executionEnabled = false;

    render() {
        const selectedSlotIdSet = new Set(this.selectedSlotIds);
        const selectedCount = this.row.slotIds.filter((slotId) => selectedSlotIdSet.has(slotId)).length;
        const allSelected = selectedCount === this.row.slotIds.length;
        const someSelected = selectedCount > 0 && !allSelected;

        return html`
            <div class="panel interval-card">
                <button
                    class="button-reset interval-summary"
                    type="button"
                    @click=${this._toggleExpanded}
                    aria-expanded=${String(this.expanded)}
                >
                    <div class="interval-summary-left">
                        <div class="interval-time">${this.row.timeRangeLabel}</div>
                        <div class="chip action">${getScheduleActionLabel(this.row.action, this.localize)}</div>
                    </div>
                    <div class="interval-summary-right">
                        <div class="muted">${formatScheduleSlotCount(this.row.slotCount, this.localize)}</div>
                        ${this.row.containsCurrentSlot
                            ? html`<div class="chip now">${this.localize("scheduling.badge.now")}</div>`
                            : nothing}
                        <div class="interval-chevron">${this.expanded ? "▾" : "▸"}</div>
                    </div>
                </button>
                ${this.expanded ? html`
                    <div class="interval-detail">
                        <div class="interval-actions">
                            <ha-formfield class="interval-select-all" .label=${this.localize("scheduling.actions.select_interval")} .disabled=${this.busy}>
                                <ha-checkbox
                                    reducedTouchTarget
                                    .checked=${allSelected}
                                    .indeterminate=${someSelected}
                                    ?disabled=${this.busy}
                                    aria-label=${`${this.localize("scheduling.actions.select_interval")} ${this.row.timeRangeLabel}`}
                                    @click=${this._stopPropagation}
                                    @change=${this._handleIntervalSelectionChange}
                                ></ha-checkbox>
                            </ha-formfield>
                            <button class="primary-button" type="button" ?disabled=${this.busy || selectedCount === 0} @click=${this._handleOpenDialog}>
                                ${this.localize("scheduling.actions.edit_selected")}
                            </button>
                        </div>
                        <div class="slot-list">
                            ${this.row.slots.map((slot) => this._renderSlotRow(slot, selectedSlotIdSet))}
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _renderSlotRow(slot: ScheduleSlot, selectedSlotIdSet: ReadonlySet<string>) {
        return html`
            <div class=${`slot-row${slot.isCurrent ? " current" : ""}`}>
                <div class="slot-selection">
                    <ha-checkbox
                        reducedTouchTarget
                        .checked=${selectedSlotIdSet.has(slot.id)}
                        ?disabled=${this.busy}
                        aria-label=${`${this.localize("scheduling.actions.select_slot")} ${slot.rangeLabel}`}
                        @click=${this._stopPropagation}
                        @change=${(event: Event) => this._handleSlotSelectionChange(slot.id, event)}
                    ></ha-checkbox>
                </div>
                <div class="slot-primary">
                    <div class="slot-time">${slot.timeLabel}</div>
                    <div class="chip action">${getScheduleActionLabel(slot.action, this.localize)}</div>
                    ${slot.isCurrent ? html`<div class="chip now">${this.localize("scheduling.badge.now")}</div>` : nothing}
                </div>
                ${slot.isCurrent ? html`
                    <div class="slot-runtime">${this._renderSlotRuntime(slot)}</div>
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

    private _toggleExpanded(): void {
        this.dispatchEvent(new CustomEvent("toggle-schedule-interval", {
            bubbles: true,
            composed: true,
            detail: { intervalId: this.row.id },
        }));
    }

    private _handleOpenDialog(): void {
        this.dispatchEvent(new CustomEvent("open-schedule-dialog", {
            bubbles: true,
            composed: true,
            detail: { intervalId: this.row.id } satisfies ScheduleOpenDialogDetail,
        }));
    }

    private _handleIntervalSelectionChange(event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("toggle-schedule-interval-selection", {
            bubbles: true,
            composed: true,
            detail: {
                intervalId: this.row.id,
                slotIds: [...this.row.slotIds],
                selected: this._isCheckboxChecked(event),
            } satisfies ScheduleIntervalSelectionDetail,
        }));
    }

    private _handleSlotSelectionChange(slotId: string, event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("toggle-schedule-slot-selection", {
            bubbles: true,
            composed: true,
            detail: {
                intervalId: this.row.id,
                slotId,
                selected: this._isCheckboxChecked(event),
            } satisfies ScheduleSlotSelectionDetail,
        }));
    }

    private _stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    private _isCheckboxChecked(event: Event): boolean {
        return (event.currentTarget as HTMLElement & { checked: boolean }).checked;
    }
}
