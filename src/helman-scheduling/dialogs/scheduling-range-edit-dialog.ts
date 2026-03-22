import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import {
    formatScheduleSlotCount,
    getScheduleActionKindLabel,
} from "../model/schedule-labels";
import type {
    ScheduleAction,
    ScheduleDialogResult,
    ScheduleDialogState,
} from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

const DIALOG_HISTORY_STATE_KEY = "__helmanSchedulingDialogId";
const DEFAULT_CHARGE_TARGET_SOC = 100;
const DEFAULT_DISCHARGE_TARGET_SOC = 15;
let nextDialogHistoryEntryId = 0;

@customElement("scheduling-range-edit-dialog")
export class SchedulingRangeEditDialog extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .dialog-content {
                display: flex;
                flex-direction: column;
                gap: 16px;
                min-width: min(540px, calc(100vw - 48px));
                padding-top: 4px;
            }

            .dialog-summary {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px 12px;
            }

            .dialog-summary-value {
                font-size: 0.95rem;
                font-weight: 500;
                line-height: 1.35;
            }

            .action-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .action-option {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--card-background-color);
                cursor: pointer;
                transition: border-color 120ms ease, background-color 120ms ease;
            }

            .action-option.selected {
                border-color: var(--primary-color);
                background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color));
            }

            .action-option-header {
                display: flex;
                align-items: flex-start;
                gap: 10px;
            }

            .action-option-radio {
                margin-top: 2px;
            }

            .action-option-copy {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }

            .action-option-title {
                font-size: 0.95rem;
                font-weight: 600;
                line-height: 1.35;
            }

            .action-option-target {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding-left: 28px;
            }

            .target-field {
                width: min(180px, 100%);
            }

            @media (max-width: 600px) {
                .dialog-content {
                    min-width: 0;
                }

                .action-option-target {
                    padding-left: 0;
                }
            }
        `,
    ];

    private _historyEntryActive = false;
    private _historyEntryId: number | null = null;
    private _ignoreNextPopstate = false;
    private readonly _handlePopState = (event: PopStateEvent): void => {
        if (!this._historyEntryActive) {
            return;
        }

        if (this._ignoreNextPopstate) {
            this._ignoreNextPopstate = false;
            return;
        }

        if (this._isCurrentHistoryEntry(event.state)) {
            return;
        }

        this._clearHistoryEntry();
        this._closeDialogElement();
    };

    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public dialogState: ScheduleDialogState | null = null;
    @property({ type: Boolean }) public open = false;

    @state() private _actionKind: ScheduleAction["kind"] = "normal";
    @state() private _targetSocInput = "";

    connectedCallback(): void {
        super.connectedCallback();
        if (typeof window !== "undefined") {
            window.addEventListener("popstate", this._handlePopState);
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (typeof window !== "undefined") {
            window.removeEventListener("popstate", this._handlePopState);
        }
        this._clearHistoryEntry();
        this._ignoreNextPopstate = false;
    }

    willUpdate(changedProperties: Map<string, unknown>): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has("dialogState") && this.dialogState !== null) {
            this._applyDialogState(this.dialogState);
        }
    }

    updated(changedProperties: Map<string, unknown>): void {
        super.updated(changedProperties);
        if (!this.open || !this.dialogState || this._historyEntryActive) {
            return;
        }

        if (changedProperties.has("open") || changedProperties.has("dialogState")) {
            this._pushHistoryEntry();
        }
    }

    render() {
        if (this.dialogState === null) {
            return nothing;
        }

        return html`
            <ha-dialog
                .open=${this.open}
                @closed=${this._onClosed}
                .heading=${this._title()}
                .headerTitle=${this._title()}
            >
                <div class="dialog-content">
                    <div class="dialog-summary">
                        <div class="field">
                            <div class="field-label">${this.localize("scheduling.dialog.interval")}</div>
                            <div class="dialog-summary-value">${this.dialogState.intervalLabel}</div>
                        </div>
                        <div class="field">
                            <div class="field-label">${this.localize("scheduling.dialog.selection")}</div>
                            <div class="dialog-summary-value">${this._selectedSlotSummaryLabel()}</div>
                        </div>
                    </div>

                    <div class="field">
                        <div class="field-label">${this.localize("scheduling.dialog.action")}</div>
                        <div class="action-options">
                            ${this._renderActionOption("normal")}
                            ${this._renderActionOption("charge_to_target_soc")}
                            ${this._renderActionOption("discharge_to_target_soc")}
                            ${this._renderActionOption("stop_charging")}
                            ${this._renderActionOption("stop_discharging")}
                        </div>
                    </div>

                    <div class="field-help">
                        ${this.localize("scheduling.dialog.affects_prefix")} ${formatScheduleSlotCount(this._selectedSlotCount(), this.localize)}
                    </div>
                </div>

                <ha-dialog-footer slot="footer">
                    <ha-button slot="secondaryAction" appearance="plain" @click=${this._handleCancel}>
                        ${this.localize("scheduling.dialog.cancel")}
                    </ha-button>
                    <ha-button slot="primaryAction" ?disabled=${!this._canSubmit()} @click=${this._handleSubmit}>
                        ${this._submitLabel()}
                    </ha-button>
                </ha-dialog-footer>
            </ha-dialog>
        `;
    }

    private _applyDialogState(dialogState: ScheduleDialogState): void {
        this._actionKind = dialogState.initialAction.kind;
        this._targetSocInput = dialogState.initialAction.targetSoc?.toString() ?? "";
    }

    private _title(): string {
        return this.localize("scheduling.dialog.title.edit_selection");
    }

    private _submitLabel(): string {
        return this.localize("scheduling.dialog.apply");
    }

    private _selectedSlotCount(): number {
        return this.dialogState?.selectedSlots.length ?? 0;
    }

    private _selectedSlotSummaryLabel(): string {
        const selectedSlots = this.dialogState?.selectedSlots ?? [];
        if (selectedSlots.length === 0) {
            return "";
        }

        const labels: string[] = [];
        let rangeStart = selectedSlots[0];
        let previousSlot = selectedSlots[0];
        const pushRangeLabel = (): void => {
            labels.push(
                rangeStart.id === previousSlot.id
                    ? rangeStart.rangeLabel
                    : previousSlot.endLabel !== null
                    ? `${rangeStart.timeLabel}–${previousSlot.endLabel}`
                    : `${rangeStart.timeLabel}–${previousSlot.timeLabel}+`,
            );
        };

        for (const slot of selectedSlots.slice(1)) {
            if (previousSlot.endMs !== null && previousSlot.endMs === slot.startMs) {
                previousSlot = slot;
                continue;
            }

            pushRangeLabel();
            rangeStart = slot;
            previousSlot = slot;
        }

        pushRangeLabel();
        const visibleLabels = labels.slice(0, 3);
        return labels.length <= 3
            ? visibleLabels.join(", ")
            : `${visibleLabels.join(", ")}, ...`;
    }

    private _renderActionOption(actionKind: ScheduleAction["kind"]) {
        const checked = this._actionKind === actionKind;
        const isTargetAction = actionKind === "charge_to_target_soc" || actionKind === "discharge_to_target_soc";
        return html`
            <div
                class=${`action-option${checked ? " selected" : ""}`}
                @click=${() => this._setActionKind(actionKind)}
            >
                <label class="action-option-header">
                    <input
                        class="action-option-radio"
                        type="radio"
                        name="schedule-action-kind"
                        .checked=${checked}
                        value=${actionKind}
                        @change=${() => this._setActionKind(actionKind)}
                    />
                    <div class="action-option-copy">
                        <div class="action-option-title">${getScheduleActionKindLabel(actionKind, this.localize)}</div>
                    </div>
                </label>
                ${checked && isTargetAction ? html`
                    <div class="action-option-target" @click=${this._stopPropagation}>
                        <ha-textfield
                            class="target-field"
                            id="schedule-target-soc"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            no-spinner
                            .label=${this.localize("scheduling.dialog.target_soc")}
                            .suffix=${"%"}
                            .value=${this._targetSocInput}
                            @input=${this._handleTargetSocInput}
                        ></ha-textfield>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _canSubmit(): boolean {
        if (this._selectedSlotCount() === 0) {
            return false;
        }

        if (this._actionKind !== "charge_to_target_soc" && this._actionKind !== "discharge_to_target_soc") {
            return true;
        }

        return /^\d+$/.test(this._targetSocInput) && Number(this._targetSocInput) >= 0 && Number(this._targetSocInput) <= 100;
    }

    private _setActionKind(actionKind: ScheduleAction["kind"]): void {
        if (this._actionKind === actionKind) {
            return;
        }

        this._actionKind = actionKind;
        if (actionKind === "charge_to_target_soc") {
            this._targetSocInput = String(DEFAULT_CHARGE_TARGET_SOC);
            return;
        }

        if (actionKind === "discharge_to_target_soc") {
            this._targetSocInput = String(DEFAULT_DISCHARGE_TARGET_SOC);
        }
    }

    private _handleTargetSocInput(event: Event): void {
        this._targetSocInput = (event.currentTarget as HTMLInputElement).value;
    }

    private _handleCancel(): void {
        this.open = false;
    }

    private _stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    private _handleSubmit(): void {
        const result = this._buildResult();
        if (result === null) {
            return;
        }

        this.dispatchEvent(new CustomEvent("schedule-dialog-submit", {
            bubbles: true,
            composed: true,
            detail: result,
        }));
    }

    private _buildResult(): ScheduleDialogResult | null {
        if (this.dialogState === null || this.dialogState.selectedSlots.length === 0) {
            return null;
        }

        const action = this._buildEditedAction();
        if (action === null) {
            return null;
        }

        return { action };
    }

    private _buildEditedAction(): ScheduleAction | null {
        if (this._actionKind !== "charge_to_target_soc" && this._actionKind !== "discharge_to_target_soc") {
            return { kind: this._actionKind };
        }

        if (!/^\d+$/.test(this._targetSocInput)) {
            return null;
        }

        const targetSoc = Number(this._targetSocInput);
        if (!Number.isInteger(targetSoc) || targetSoc < 0 || targetSoc > 100) {
            return null;
        }

        return {
            kind: this._actionKind,
            targetSoc,
        };
    }

    private _closeDialogElement(): void {
        this.open = false;
    }

    private _onClosed(): void {
        if (this._canConsumeCurrentHistoryEntry()) {
            this._ignoreNextPopstate = true;
            this._clearHistoryEntry();
            window.history.back();
        } else {
            this._clearHistoryEntry();
        }

        this.dispatchEvent(new CustomEvent("closed", { bubbles: true, composed: true }));
    }

    private _pushHistoryEntry(): void {
        if (typeof window === "undefined" || typeof window.history.pushState !== "function") {
            return;
        }

        const nextEntryId = ++nextDialogHistoryEntryId;
        const nextState = this._getHistoryStateRecord(window.history.state);
        nextState[DIALOG_HISTORY_STATE_KEY] = nextEntryId;
        window.history.pushState(nextState, "");
        this._historyEntryId = nextEntryId;
        this._historyEntryActive = true;
        this._ignoreNextPopstate = false;
    }

    private _canConsumeCurrentHistoryEntry(): boolean {
        return typeof window !== "undefined"
            && typeof window.history.back === "function"
            && this._historyEntryActive
            && this._isCurrentHistoryEntry(window.history.state);
    }

    private _isCurrentHistoryEntry(state: unknown): boolean {
        return this._historyEntryId !== null && this._readHistoryEntryId(state) === this._historyEntryId;
    }

    private _readHistoryEntryId(state: unknown): number | null {
        if (state === null || typeof state !== "object") {
            return null;
        }

        const entryId = (state as Record<string, unknown>)[DIALOG_HISTORY_STATE_KEY];
        return typeof entryId === "number" ? entryId : null;
    }

    private _getHistoryStateRecord(state: unknown): Record<string, unknown> {
        if (state === null || typeof state !== "object") {
            return {};
        }

        return { ...(state as Record<string, unknown>) };
    }

    private _clearHistoryEntry(): void {
        this._historyEntryActive = false;
        this._historyEntryId = null;
    }
}
