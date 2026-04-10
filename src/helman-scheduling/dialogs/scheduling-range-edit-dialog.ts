import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import "../components/scheduling-action-option-card";
import "./scheduling-ev-charger-editor";
import "./scheduling-generic-appliance-editor";
import "./scheduling-climate-appliance-editor";
import { getScheduleActionPresentation } from "../model/schedule-action-presentation";
import type { ScheduleActionOptionSelectDetail } from "../components/scheduling-action-option-card";
import type { ScheduleApplianceActionChangeDetail } from "./schedule-appliance-editor-types";
import {
    formatScheduleSlotCount,
} from "../model/schedule-labels";
import type {
    ScheduleApplianceAction,
    ScheduleDialogResult,
    ScheduleDialogState,
} from "../schedule-types";
import {
    areScheduleActionsEqual,
    areScheduleApplianceActionsEqual,
    cloneScheduleApplianceAction,
    cloneScheduleDomains,
    isTargetScheduleAction,
    type ScheduleAction,
} from "../schedule-types";
import type {
    ScheduleApplianceMetadata,
    ScheduleClimateApplianceMetadata,
    ScheduleEvChargerApplianceMetadata,
    ScheduleGenericApplianceMetadata,
} from "../model/schedule-appliance-metadata";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

const DIALOG_HISTORY_STATE_KEY = "__helmanSchedulingDialogId";
const DEFAULT_CHARGE_TARGET_SOC = 100;
const DEFAULT_DISCHARGE_TARGET_SOC = 15;
let nextDialogHistoryEntryId = 0;

type ScheduleDialogTabId = "inverter" | "appliances";

@customElement("scheduling-range-edit-dialog")
export class SchedulingRangeEditDialog extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .dialog-content {
                display: flex;
                flex-direction: column;
                gap: 16px;
                min-width: min(560px, calc(100vw - 48px));
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

            .action-options,
            .appliance-sections {
                display: flex;
                flex-direction: column;
            }

            .action-options {
                gap: 8px;
            }

            .appliance-sections {
                gap: 12px;
            }

            .dialog-tabs {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .dialog-tab {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
                padding: 8px 12px;
                position: relative;
                border-radius: 999px;
                border: 1px solid var(--divider-color);
                background: var(--card-background-color);
                color: inherit;
                cursor: pointer;
                transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
            }

            .dialog-tab:hover:not(:disabled) {
                border-color: color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 32%, var(--divider-color));
            }

            .dialog-tab.configured {
                --dialog-tab-accent: var(--schedule-action-tone-accent, var(--primary-color));
                border-color: var(--schedule-action-tone-border, color-mix(in srgb, var(--dialog-tab-accent) 30%, var(--divider-color)));
                background: var(--schedule-action-tone-bg, color-mix(in srgb, var(--dialog-tab-accent) 14%, transparent));
                color: var(--schedule-action-tone-color, color-mix(in srgb, var(--dialog-tab-accent) 82%, var(--primary-text-color)));
            }

            .dialog-tab.active {
                border-color: color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 48%, var(--divider-color));
                background: color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 18%, var(--card-background-color));
                color: color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 88%, var(--primary-text-color));
                box-shadow:
                    inset 0 0 0 1px color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 22%, transparent),
                    0 0 0 2px color-mix(in srgb, var(--dialog-tab-accent, var(--primary-color)) 24%, transparent);
                font-weight: 700;
            }

            .dialog-tab.unconfigured {
                color: var(--secondary-text-color);
            }

            .dialog-tab-icon {
                flex: 0 0 auto;
                --mdc-icon-size: 1rem;
                color: var(--schedule-action-tone-icon, currentColor);
            }

            .dialog-tab-label {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 0.85rem;
                font-weight: 600;
            }

            .dialog-panel {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .unsupported-appliance {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--secondary-background-color);
            }

            @media (max-width: 600px) {
                .dialog-content {
                    min-width: 0;
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
    @property({ attribute: false }) public appliances: ScheduleApplianceMetadata[] = [];
    @property({ type: Boolean }) public open = false;

    @state() private _actionKind: ScheduleAction["kind"] | null = null;
    @state() private _targetSocInput = "";
    @state() private _activeTabId: ScheduleDialogTabId = "inverter";
    @state() private _initialDomains: ScheduleDialogState["initialDomains"] = null;
    @state() private _inverterEdited = false;
    @state() private _draftApplianceActions: Record<string, ScheduleApplianceAction | null> = {};
    @state() private _applianceValidity: Record<string, boolean> = {};
    @state() private _editedApplianceIds: string[] = [];

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
                            <div class="field-label">${this.localize("scheduling.dialog.selection")}</div>
                            <div class="dialog-summary-value">${this._selectedSlotSummaryLabel()}</div>
                        </div>
                    </div>

                    <div class="dialog-tabs" role="tablist" aria-label=${this.localize("scheduling.dialog.tabs")}>
                        ${this._renderInverterTab()}
                        ${this._renderAppliancesTab()}
                    </div>

                    <div class="dialog-panel">
                        ${this._activeTabId === "inverter"
                            ? this._renderInverterPanel()
                            : this._renderAppliancesPanel()}
                    </div>

                    <div class="field-help">
                        ${this.localize("scheduling.dialog.affects_prefix")} ${formatScheduleSlotCount(this._selectedSlotCount(), this.localize)}
                    </div>
                </div>

                <ha-dialog-footer slot="footer">
                    <ha-button slot="secondaryAction" .appearance=${"plain"} @click=${this._handleCancel}>
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
        const initialDomains = dialogState.initialDomains === null
            ? null
            : cloneScheduleDomains(dialogState.initialDomains);
        const draftApplianceActions = Object.fromEntries(
            Object.entries(initialDomains?.appliances ?? {}).map(([applianceId, action]) => [
                applianceId,
                this._normalizeDraftApplianceAction(action),
            ]),
        );
        this._initialDomains = initialDomains;
        this._activeTabId = "inverter";
        this._inverterEdited = false;
        this._actionKind = initialDomains?.inverter.kind ?? "empty";
        this._targetSocInput = initialDomains?.inverter.targetSoc?.toString() ?? "";
        this._draftApplianceActions = draftApplianceActions;
        this._applianceValidity = Object.fromEntries(
            Object.keys(this._draftApplianceActions).map((applianceId) => [applianceId, true]),
        );
        this._editedApplianceIds = Object.entries(initialDomains?.appliances ?? {}).flatMap(
            ([applianceId, action]) => {
                const draftAction = draftApplianceActions[applianceId] ?? null;
                return this._isApplianceActionEdited(action, draftAction) ? [applianceId] : [];
            },
        );
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
        const previewAction = this._buildActionOptionPreview(actionKind);
        const checked = this._actionKind === actionKind;
        return html`
            <scheduling-action-option-card
                .action=${previewAction}
                .checked=${checked}
                .localize=${this.localize}
                radioName="schedule-action-kind"
                @schedule-action-option-select=${this._handleActionOptionSelect}
            >
                ${checked && this._isTargetActionKind(actionKind) ? html`
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
                ` : nothing}
            </scheduling-action-option-card>
        `;
    }

    private _renderInverterTab() {
        const action = this._actionKind === null
            ? { kind: "empty" as const }
            : this._buildActionOptionPreview(this._actionKind);
        const presentation = getScheduleActionPresentation(action, this.localize, "table");
        const configured = this._actionKind !== null && this._actionKind !== "empty";
        const active = this._activeTabId === "inverter";
        const title = configured
            ? this.localize("scheduling.dialog.tab.configured")
            : this.localize("scheduling.dialog.tab.not_configured");
        return html`
            <button
                class=${`dialog-tab ${configured ? `configured ${presentation.toneClass}` : "unconfigured action-tone-empty"}${active ? " active" : ""}`}
                type="button"
                role="tab"
                aria-selected=${active ? "true" : "false"}
                title=${title}
                @click=${() => this._setActiveTab("inverter")}
            >
                <ha-icon class="dialog-tab-icon" .icon=${presentation.icon} aria-hidden="true"></ha-icon>
                <span class="dialog-tab-label">${this.localize("scheduling.dialog.inverter")}</span>
            </button>
        `;
    }

    private _renderAppliancesTab() {
        const configured = this._hasConfiguredApplianceActions();
        const active = this._activeTabId === "appliances";
        const title = configured
            ? this.localize("scheduling.dialog.tab.configured")
            : this.localize("scheduling.dialog.tab.not_configured");
        return html`
            <button
                class=${`dialog-tab ${configured ? "configured action-tone-charge" : "unconfigured action-tone-neutral"}${active ? " active" : ""}`}
                type="button"
                role="tab"
                aria-selected=${active ? "true" : "false"}
                title=${title}
                @click=${() => this._setActiveTab("appliances")}
            >
                <ha-icon class="dialog-tab-icon" .icon=${"mdi:power-plug"} aria-hidden="true"></ha-icon>
                <span class="dialog-tab-label">${this.localize("scheduling.dialog.appliances")}</span>
            </button>
        `;
    }

    private _renderInverterPanel() {
        return html`
            <div class="field">
                <div class="field-label">${this.localize("scheduling.dialog.inverter")}</div>
                <div class="action-options">
                    ${this._renderActionOption("empty")}
                    ${this._renderActionOption("normal")}
                    ${this._renderActionOption("charge_to_target_soc")}
                    ${this._renderActionOption("discharge_to_target_soc")}
                    ${this._renderActionOption("stop_charging")}
                    ${this._renderActionOption("stop_discharging")}
                    ${this._renderActionOption("stop_export")}
                </div>
                ${this._actionKind === null ? html`
                    <div class="field-help">${this.localize("scheduling.dialog.choose_action")}</div>
                ` : nothing}
            </div>
        `;
    }

    private _renderAppliancesPanel() {
        return html`
            <div class="appliance-sections">
                ${this.appliances.map((appliance) => this._renderApplianceSection(appliance))}
            </div>
        `;
    }

    private _renderApplianceSection(appliance: ScheduleApplianceMetadata) {
        if (!appliance.supportsAuthoring) {
            return this._renderUnsupportedApplianceSection(appliance);
        }

        switch (appliance.kind) {
            case "ev_charger":
                return this._renderEvChargerSection(appliance);
            case "climate":
                return this._renderClimateSection(appliance);
            case "generic":
                return this._renderGenericSection(appliance);
            default:
                return this._renderUnsupportedApplianceSection(appliance);
        }
    }

    private _renderEvChargerSection(appliance: ScheduleEvChargerApplianceMetadata) {
        return html`
            <scheduling-ev-charger-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                @schedule-appliance-action-change=${this._handleApplianceActionChange}
            ></scheduling-ev-charger-editor>
        `;
    }

    private _renderGenericSection(appliance: ScheduleGenericApplianceMetadata) {
        return html`
            <scheduling-generic-appliance-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                @schedule-appliance-action-change=${this._handleApplianceActionChange}
            ></scheduling-generic-appliance-editor>
        `;
    }

    private _renderClimateSection(appliance: ScheduleClimateApplianceMetadata) {
        return html`
            <scheduling-climate-appliance-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                @schedule-appliance-action-change=${this._handleApplianceActionChange}
            ></scheduling-climate-appliance-editor>
        `;
    }

    private _renderUnsupportedApplianceSection(appliance: ScheduleApplianceMetadata) {
        return html`
            <div class="unsupported-appliance">
                <div class="panel-title">${appliance.name}</div>
                <div class="field-help">${this.localize("scheduling.dialog.appliance.unsupported_authoring")}</div>
            </div>
        `;
    }

    private _canSubmit(): boolean {
        if (this._selectedSlotCount() === 0) {
            return false;
        }

        if (this._actionKind === null) {
            return false;
        }

        if (Object.values(this._applianceValidity).some((valid) => !valid)) {
            return false;
        }

        if (!this._isTargetActionKind(this._actionKind)) {
            return true;
        }

        return /^\d+$/.test(this._targetSocInput)
            && Number(this._targetSocInput) >= 0
            && Number(this._targetSocInput) <= 100;
    }

    private _setActionKind(actionKind: ScheduleAction["kind"]): void {
        if (this._actionKind === actionKind) {
            return;
        }

        this._actionKind = actionKind;
        if (!this._isTargetActionKind(actionKind)) {
            this._updateInverterEditedState();
            return;
        }

        if (this._targetSocInput.trim().length > 0) {
            this._updateInverterEditedState();
            return;
        }

        this._targetSocInput = actionKind === "charge_to_target_soc"
            ? String(DEFAULT_CHARGE_TARGET_SOC)
            : String(DEFAULT_DISCHARGE_TARGET_SOC);
        this._updateInverterEditedState();
    }

    private _handleTargetSocInput(event: Event): void {
        this._targetSocInput = (event.currentTarget as HTMLInputElement).value;
        this._updateInverterEditedState();
    }

    private _handleCancel(): void {
        this.open = false;
    }

    private _handleActionOptionSelect(event: CustomEvent<ScheduleActionOptionSelectDetail>): void {
        this._setActionKind(event.detail.actionKind);
    }

    private _handleApplianceActionChange(
        event: CustomEvent<ScheduleApplianceActionChangeDetail>,
    ): void {
        const { applianceId, action, valid } = event.detail;
        this._applianceValidity = {
            ...this._applianceValidity,
            [applianceId]: valid,
        };
        this._draftApplianceActions = {
            ...this._draftApplianceActions,
            [applianceId]: action === null ? null : cloneScheduleApplianceAction(action),
        };
        this._editedApplianceIds = this._computeEditedApplianceIds(applianceId, action);
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

        const domains = this._buildEditedDomains();
        if (domains === null) {
            return null;
        }

        return {
            domains,
            editedInverter: this._inverterEdited,
            editedApplianceIds: [...this._editedApplianceIds],
        };
    }

    private _buildEditedDomains() {
        const inverter = this._buildEditedAction();
        if (inverter === null) {
            return null;
        }

        return {
            inverter,
            appliances: Object.fromEntries(
                Object.entries(this._draftApplianceActions).flatMap(([applianceId, action]) =>
                    action === null ? [] : [[applianceId, cloneScheduleApplianceAction(action)]]
                ),
            ),
        };
    }

    private _buildEditedAction(): ScheduleAction | null {
        if (this._actionKind === null) {
            return null;
        }

        if (!this._isTargetActionKind(this._actionKind)) {
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

    private _buildActionOptionPreview(actionKind: ScheduleAction["kind"]): ScheduleAction {
        if (!this._isTargetActionKind(actionKind)) {
            return { kind: actionKind };
        }

        const targetSoc = this._resolvePreviewTargetSoc(actionKind);
        return targetSoc === null
            ? { kind: actionKind }
            : { kind: actionKind, targetSoc };
    }

    private _resolvePreviewTargetSoc(actionKind: "charge_to_target_soc" | "discharge_to_target_soc"): number | null {
        if (/^\d+$/.test(this._targetSocInput)) {
            return Number(this._targetSocInput);
        }

        if (this._actionKind !== null && this._isTargetActionKind(this._actionKind) && this._targetSocInput.trim().length === 0) {
            return null;
        }

        if (this._targetSocInput.trim().length > 0) {
            return null;
        }

        return actionKind === "charge_to_target_soc"
            ? DEFAULT_CHARGE_TARGET_SOC
            : DEFAULT_DISCHARGE_TARGET_SOC;
    }

    private _isTargetActionKind(
        actionKind: ScheduleAction["kind"],
    ): actionKind is "charge_to_target_soc" | "discharge_to_target_soc" {
        return isTargetScheduleAction({ kind: actionKind });
    }

    private _setActiveTab(tabId: ScheduleDialogTabId): void {
        this._activeTabId = tabId;
    }

    private _updateInverterEditedState(): void {
        const currentAction = this._buildEditedAction();
        const initialAction = this._initialDomains?.inverter ?? null;
        this._inverterEdited = currentAction === null || initialAction === null
            ? currentAction !== initialAction
            : !areScheduleActionsEqual(currentAction, initialAction);
    }

    private _computeEditedApplianceIds(
        applianceId: string,
        nextAction: ScheduleApplianceAction | null,
    ): string[] {
        const initialAction = this._initialDomains?.appliances[applianceId] ?? null;
        const isEdited = this._isApplianceActionEdited(initialAction, nextAction);

        const nextEditedIds = new Set(this._editedApplianceIds);
        if (isEdited) {
            nextEditedIds.add(applianceId);
        } else {
            nextEditedIds.delete(applianceId);
        }

        return [...nextEditedIds];
    }

    private _normalizeDraftApplianceAction(
        action: ScheduleApplianceAction,
    ): ScheduleApplianceAction | null {
        return cloneScheduleApplianceAction(action);
    }

    private _isApplianceActionEdited(
        initialAction: ScheduleApplianceAction | null,
        nextAction: ScheduleApplianceAction | null,
    ): boolean {
        const normalizedInitialAction = initialAction === null
            ? null
            : this._normalizeDraftApplianceAction(initialAction);
        const normalizedNextAction = nextAction === null
            ? null
            : this._normalizeDraftApplianceAction(nextAction);
        return normalizedNextAction === null || normalizedInitialAction === null
            ? normalizedNextAction !== normalizedInitialAction
            : !areScheduleApplianceActionsEqual(normalizedNextAction, normalizedInitialAction);
    }

    private _hasConfiguredApplianceActions(): boolean {
        return this.appliances.some((appliance) => this._draftApplianceActions[appliance.id] !== null);
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
