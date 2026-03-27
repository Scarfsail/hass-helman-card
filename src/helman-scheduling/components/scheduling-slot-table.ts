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
    ScheduleSlot,
    ScheduleSlotToggleDetail,
    ScheduleTableSectionModel,
} from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

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
                grid-template-columns: 32px 1fr;
                grid-template-areas:
                    "selection primary"
                    ". runtime";
                align-items: center;
                column-gap: 2px;
                padding: 0 4px;
                border-radius: 6px;
            }

            .slot-row:hover {
                background: color-mix(in srgb, var(--primary-color) 5%, transparent);
            }

            .slot-row.current {
                background: color-mix(in srgb, var(--primary-color) 8%, transparent);
                border-left: 3px solid var(--primary-color);
            }

            .slot-row.selected {
                background: color-mix(in srgb, var(--primary-color) 10%, transparent);
            }

            .slot-row.current.selected {
                background: color-mix(in srgb, var(--primary-color) 14%, transparent);
            }

            .slot-selection {
                grid-area: selection;
                display: flex;
                align-items: center;
            }

            .slot-selection ha-checkbox {
                display: block;
            }

            .slot-primary {
                grid-area: primary;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                min-height: 28px;
                min-width: 0;
            }

            .slot-time {
                min-width: 44px;
                font-size: 0.85rem;
                font-weight: 600;
                line-height: 1.2;
                white-space: nowrap;
            }

            .slot-primary .chip,
            .slot-runtime .chip {
                min-height: 18px;
                padding: 1px 5px;
                font-size: 0.75rem;
            }

            .slot-runtime {
                grid-area: runtime;
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                align-items: center;
                min-width: 0;
                padding-bottom: 2px;
            }

            .slot-runtime .muted {
                font-size: 0.78rem;
                line-height: 1.2;
            }

            .edit-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 0 4px 8px;
                border-bottom: 1px solid var(--divider-color);
            }

            .edit-bar .muted {
                font-size: 0.82rem;
            }
        `,
    ];

    private _selectedSet: ReadonlySet<string> = new Set();

    @property({ attribute: false }) public sections: ScheduleTableSectionModel[] = [];
    @property({ attribute: false }) public selectedSlotIds: string[] = [];
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
            ${this._selectedSet.size > 0 ? html`
                <div class="edit-bar">
                    <div class="muted">${this.localize("scheduling.copy.selected_prefix")} ${formatScheduleSlotCount(this._selectedSet.size, this.localize)}</div>
                    <button
                        class="primary-button"
                        type="button"
                        ?disabled=${this.busy}
                        @click=${this._handleOpenDialog}
                    >${this.localize("scheduling.actions.edit_selected")}</button>
                </div>
            ` : nothing}
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

        return html`
            <div class=${classes}>
                <div class="slot-selection">
                    <ha-checkbox
                        reducedTouchTarget
                        .checked=${selected}
                        ?disabled=${this.busy}
                        aria-label=${`${this.localize("scheduling.actions.select_slot")} ${slot.rangeLabel}`}
                        @change=${(event: Event) => this._handleSlotToggle(slot.id, event)}
                    ></ha-checkbox>
                </div>
                <div class="slot-primary">
                    <div class="slot-time">${slot.rangeLabel}</div>
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

    private _handleSlotToggle(slotId: string, event: Event): void {
        event.stopPropagation();
        const checked = (event.currentTarget as HTMLElement & { checked: boolean }).checked;
        this.dispatchEvent(new CustomEvent("toggle-schedule-slot-selection", {
            bubbles: true,
            composed: true,
            detail: { slotId, selected: checked } satisfies ScheduleSlotToggleDetail,
        }));
    }

    private _handleOpenDialog(): void {
        this.dispatchEvent(new CustomEvent("open-schedule-dialog", {
            bubbles: true,
            composed: true,
        }));
    }
}
