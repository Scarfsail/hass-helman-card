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
import type { ScheduleDialogMode, ScheduleIntervalRowModel, ScheduleSlot } from "../schedule-types";
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
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                width: 100%;
                padding: 12px;
                cursor: pointer;
                text-align: left;
            }

            .interval-summary-left {
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-width: 0;
            }

            .interval-time {
                font-size: 0.92rem;
                font-weight: 700;
                line-height: 1.2;
            }

            .interval-summary-right {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
                min-width: 0;
            }

            .interval-chevron {
                color: var(--secondary-text-color);
                font-size: 0.9rem;
            }

            .interval-detail {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 0 12px 12px;
                border-top: 1px solid var(--divider-color);
            }

            .interval-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding-top: 12px;
            }

            .slot-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .slot-row {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 10px;
                border-radius: 10px;
                background: var(--card-background-color);
            }

            .slot-row.current {
                outline: 1px solid color-mix(in srgb, var(--primary-color) 38%, var(--divider-color));
            }

            .slot-main {
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-width: 0;
            }

            .slot-primary {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px;
            }

            .slot-time {
                min-width: 48px;
                font-weight: 600;
            }

            .slot-runtime {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
        `,
    ];

    @property({ attribute: false }) public row!: ScheduleIntervalRowModel;
    @property({ type: Boolean }) public expanded = false;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: Boolean }) public busy = false;
    @property({ type: Boolean }) public executionEnabled = false;

    render() {
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
                            <button class="link-button" type="button" ?disabled=${this.busy} @click=${() => this._openDialog("edit-interval")}>
                                ${this.localize("scheduling.actions.edit_interval")}
                            </button>
                            <button class="link-button" type="button" ?disabled=${this.busy} @click=${() => this._openDialog("edit-range")}>
                                ${this.localize("scheduling.actions.edit_range")}
                            </button>
                            <button class="link-button" type="button" ?disabled=${this.busy} @click=${() => this._openDialog("reset-interval")}>
                                ${this.localize("scheduling.actions.reset_interval")}
                            </button>
                            <button class="link-button" type="button" ?disabled=${this.busy} @click=${() => this._openDialog("reset-range")}>
                                ${this.localize("scheduling.actions.reset_range")}
                            </button>
                        </div>
                        <div class="slot-list">
                            ${this.row.slots.map((slot) => this._renderSlotRow(slot))}
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _renderSlotRow(slot: ScheduleSlot) {
        return html`
            <div class=${`slot-row${slot.isCurrent ? " current" : ""}`}>
                <div class="slot-main">
                    <div class="slot-primary">
                        <div class="slot-time">${slot.timeLabel}</div>
                        <div class="chip action">${getScheduleActionLabel(slot.action, this.localize)}</div>
                        ${slot.isCurrent ? html`<div class="chip now">${this.localize("scheduling.badge.now")}</div>` : nothing}
                    </div>
                    ${slot.isCurrent ? html`
                        <div class="slot-runtime">${this._renderSlotRuntime(slot)}</div>
                    ` : nothing}
                </div>
                <button
                    class="link-button"
                    type="button"
                    ?disabled=${this.busy}
                    @click=${() => this._openDialog("edit-slot", slot.id)}
                >
                    ${this.localize("scheduling.actions.edit_slot")}
                </button>
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

    private _openDialog(mode: ScheduleDialogMode, slotId?: string): void {
        this.dispatchEvent(new CustomEvent("open-schedule-dialog", {
            bubbles: true,
            composed: true,
            detail: { mode, intervalId: this.row.id, slotId },
        }));
    }
}
