import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import "../components/scheduling-action-option-card";
import "../components/scheduling-action-chip";
import "../components/scheduling-appliance-chip";
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
    ScheduleSelectionValueSummary,
} from "../schedule-types";
import {
    areScheduleActionsEqual,
    areScheduleApplianceActionsEqual,
    cloneScheduleApplianceAction,
    cloneScheduleInverterAction,
    isScheduleClimateApplianceAction,
    isScheduleEvChargerAction,
    isScheduleGenericApplianceAction,
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

            .action-options {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .appliance-sections {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .inverter-action-detail {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .inverter-action-detail .target-field {
                width: min(180px, 100%);
            }

            .panel.inverter-panel-highlight {
                border-color: var(--schedule-action-tone-border, var(--divider-color));
                background: color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 14%, var(--secondary-background-color));
                box-shadow:
                    inset 0 0 0 1px color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 14%, transparent),
                    0 0 0 1px color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 6%, transparent);
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
    @state() private _selectionSummary: ScheduleDialogState["selectionSummary"] | null = null;
    @state() private _inverterEdited = false;
    @state() private _draftApplianceActions: Record<string, ScheduleApplianceAction | null> = {};
    @state() private _applianceValidity: Record<string, boolean> = {};
    @state() private _editedApplianceIds: string[] = [];
    @state() private _overwriteMixedInverter = false;
    @state() private _overwriteMixedAppliances: Record<string, boolean> = {};

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

                    <div class="dialog-panel">
                        ${this._renderInverterPanel()}
                        ${this._renderAppliancesPanel()}
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
        const selectionSummary = dialogState.selectionSummary;
        const draftApplianceActions = Object.fromEntries(
            Object.entries(selectionSummary.appliances).map(([applianceId, summary]) => [
                applianceId,
                this._cloneDraftApplianceAction(summary.seedValue),
            ]),
        );
        this._selectionSummary = selectionSummary;
        this._inverterEdited = false;
        this._overwriteMixedInverter = selectionSummary.inverter.state === "uniform";
        this._actionKind = selectionSummary.inverter.seedValue.kind;
        this._targetSocInput = selectionSummary.inverter.seedValue.targetSoc?.toString() ?? "";
        this._draftApplianceActions = draftApplianceActions;
        this._applianceValidity = Object.fromEntries(
            Object.keys(this._draftApplianceActions).map((applianceId) => [applianceId, true]),
        );
        this._overwriteMixedAppliances = Object.fromEntries(
            Object.entries(selectionSummary.appliances).map(([applianceId, summary]) => [
                applianceId,
                summary.state === "uniform",
            ]),
        );
        this._editedApplianceIds = [];
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
            ></scheduling-action-option-card>
        `;
    }

    private _renderInverterPanel() {
        const panelClasses = this._inverterPanelClasses();
        const selectionSummary = this._selectionSummary?.inverter ?? null;
        const showEditor = this._isInverterEditorActive();
        const isMixed = selectionSummary?.state === "mixed";
        return html`
            <div class=${panelClasses}>
                <div class=${isMixed ? "mixed-summary-header" : "panel-header-inline"}>
                    <div class="panel-title">${this.localize("scheduling.dialog.inverter")}</div>
                    ${isMixed ? this._renderMixedInverterToggle() : nothing}
                </div>
                ${isMixed ? this._renderMixedInverterSummary(selectionSummary) : nothing}
                ${isMixed && showEditor ? html`<div class="mixed-editor-divider"></div>` : nothing}
                ${showEditor ? html`
                    <div class="action-options" role="radiogroup" aria-label=${this.localize("scheduling.dialog.inverter")}>
                        ${this._renderActionOption("empty")}
                        ${this._renderActionOption("normal")}
                        ${this._renderActionOption("charge_to_target_soc")}
                        ${this._renderActionOption("discharge_to_target_soc")}
                        ${this._renderActionOption("stop_charging")}
                        ${this._renderActionOption("stop_discharging")}
                        ${this._renderActionOption("stop_export")}
                    </div>
                    ${this._renderInverterActionDetail()}
                ` : nothing}
                ${showEditor && this._actionKind === null ? html`
                    <div class="field-help">${this.localize("scheduling.dialog.choose_action")}</div>
                ` : nothing}
            </div>
        `;
    }

    private _renderAppliancesPanel() {
        const missingMixedAppliances = this._buildMissingMixedApplianceIds();
        if (this.appliances.length === 0 && missingMixedAppliances.length === 0) {
            return nothing;
        }

        return html`
            <div class="appliance-sections">
                ${this.appliances.map((appliance) => this._renderApplianceSection(appliance))}
                ${missingMixedAppliances.map((applianceId) => this._renderMissingApplianceSummary(applianceId))}
            </div>
        `;
    }

    private _renderApplianceSection(appliance: ScheduleApplianceMetadata) {
        if (!appliance.supportsAuthoring) {
            return this._renderUnsupportedApplianceSection(appliance);
        }

        const selectionSummary = this._selectionSummary?.appliances[appliance.id] ?? null;
        const overwriteEnabled = this._isApplianceEditorActive(appliance.id);
        const isMixed = selectionSummary?.state === "mixed";
        return this._renderApplianceEditor(
            appliance,
            isMixed
                ? this._renderMixedApplianceToggle(appliance.id, overwriteEnabled)
                : nothing,
            isMixed
                ? this._renderMixedApplianceSummary(appliance, selectionSummary)
                : nothing,
            isMixed,
            !isMixed || overwriteEnabled,
        );
    }

    private _renderApplianceEditor(
        appliance: ScheduleApplianceMetadata,
        mixedHeaderControl: unknown,
        mixedBody: unknown,
        mixed: boolean,
        showControls: boolean,
    ) {
        switch (appliance.kind) {
            case "ev_charger":
                return this._renderEvChargerSection(appliance, mixedHeaderControl, mixedBody, mixed, showControls);
            case "climate":
                return this._renderClimateSection(appliance, mixedHeaderControl, mixedBody, mixed, showControls);
            case "generic":
                return this._renderGenericSection(appliance, mixedHeaderControl, mixedBody, mixed, showControls);
            default:
                return this._renderUnsupportedApplianceSection(appliance);
        }
    }

    private _renderEvChargerSection(
        appliance: ScheduleEvChargerApplianceMetadata,
        mixedHeaderControl: unknown,
        mixedBody: unknown,
        mixed: boolean,
        showControls: boolean,
    ) {
        return html`
            <scheduling-ev-charger-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                .mixedHeaderControl=${mixedHeaderControl}
                .mixedBody=${mixedBody}
                .mixed=${mixed}
                .showControls=${showControls}
                @schedule-appliance-action-change=${this._handleApplianceActionChange}
            ></scheduling-ev-charger-editor>
        `;
    }

    private _renderGenericSection(
        appliance: ScheduleGenericApplianceMetadata,
        mixedHeaderControl: unknown,
        mixedBody: unknown,
        mixed: boolean,
        showControls: boolean,
    ) {
        return html`
            <scheduling-generic-appliance-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                .mixedHeaderControl=${mixedHeaderControl}
                .mixedBody=${mixedBody}
                .mixed=${mixed}
                .showControls=${showControls}
                @schedule-appliance-action-change=${this._handleApplianceActionChange}
            ></scheduling-generic-appliance-editor>
        `;
    }

    private _renderClimateSection(
        appliance: ScheduleClimateApplianceMetadata,
        mixedHeaderControl: unknown,
        mixedBody: unknown,
        mixed: boolean,
        showControls: boolean,
    ) {
        return html`
            <scheduling-climate-appliance-editor
                .appliance=${appliance}
                .localize=${this.localize}
                .action=${this._draftApplianceActions[appliance.id] ?? null}
                .mixedHeaderControl=${mixedHeaderControl}
                .mixedBody=${mixedBody}
                .mixed=${mixed}
                .showControls=${showControls}
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

    private _renderMissingApplianceSummary(applianceId: string) {
        const summary = this._selectionSummary?.appliances[applianceId];
        if (!summary || summary.state !== "mixed") {
            return nothing;
        }

        const appliance = this._buildFallbackApplianceChipMetadata(applianceId, summary);
        return html`
            <div class="panel">
                <div class="mixed-summary-copy">
                    <div class="panel-title">${appliance.name}</div>
                    <div class="field-help">${this.localize("scheduling.dialog.appliance.missing_metadata")}</div>
                    <div class="field-label">${this.localize("scheduling.dialog.existing_actions")}</div>
                </div>
                <div class="mixed-summary-chips">
                    ${summary.distinctValues.map((option) => html`
                        <scheduling-appliance-chip
                            .appliance=${appliance}
                            .action=${option.value}
                            .localize=${this.localize}
                            size="compact"
                        ></scheduling-appliance-chip>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderMixedInverterToggle() {
        return html`
            <label class="toggle-control">
                <span>${this.localize("scheduling.dialog.overwrite_existing_actions")}</span>
                <ha-switch
                    .checked=${this._overwriteMixedInverter}
                    @change=${this._handleInverterOverwriteChange}
                ></ha-switch>
            </label>
        `;
    }

    private _renderMixedInverterSummary(
        summary: ScheduleSelectionValueSummary<ScheduleAction>,
    ) {
        return html`
            <div class="mixed-summary">
                <div class="field-help">${this.localize("scheduling.dialog.multiple_actions_defined")}</div>
                <div class="mixed-summary-chips">
                    ${summary.distinctValues.map((option) => html`
                        <scheduling-action-chip
                            .action=${option.value}
                            .localize=${this.localize}
                            size="compact"
                        ></scheduling-action-chip>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderMixedApplianceToggle(applianceId: string, overwriteEnabled: boolean) {
        return html`
            <label class="toggle-control">
                <span>${this.localize("scheduling.dialog.overwrite_existing_actions")}</span>
                <ha-switch
                    .checked=${overwriteEnabled}
                    @change=${(event: Event) => this._handleApplianceOverwriteChange(applianceId, event)}
                ></ha-switch>
            </label>
        `;
    }

    private _renderMixedApplianceSummary(
        appliance: ScheduleApplianceMetadata,
        summary: ScheduleSelectionValueSummary<ScheduleApplianceAction | null>,
    ) {
        return html`
            <div class="mixed-summary">
                <div class="field-help">${this.localize("scheduling.dialog.multiple_actions_defined")}</div>
                <div class="mixed-summary-chips">
                    ${summary.distinctValues.map((option) => html`
                        <scheduling-appliance-chip
                            .appliance=${appliance}
                            .action=${option.value}
                            .localize=${this.localize}
                            size="compact"
                        ></scheduling-appliance-chip>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderInverterActionDetail() {
        if (this._actionKind === null || !this._isTargetActionKind(this._actionKind)) {
            return nothing;
        }

        return html`
            <div class="inverter-action-detail">
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
        `;
    }

    private _canSubmit(): boolean {
        if (this._selectedSlotCount() === 0) {
            return false;
        }

        if (Object.entries(this._applianceValidity).some(([applianceId, valid]) => !valid && this._isApplianceEditorActive(applianceId))) {
            return false;
        }

        if (!this._isInverterEditorActive()) {
            return true;
        }

        if (this._actionKind === null) {
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

    private _handleInverterOverwriteChange(event: Event): void {
        const checked = (event.currentTarget as { checked: boolean }).checked;
        this._overwriteMixedInverter = checked;
        this._resetInverterDraft();
        this._updateInverterEditedState();
    }

    private _handleApplianceOverwriteChange(applianceId: string, event: Event): void {
        const checked = (event.currentTarget as { checked: boolean }).checked;
        const nextOverwriteMixedAppliances = {
            ...this._overwriteMixedAppliances,
            [applianceId]: checked,
        };
        const nextDraftApplianceActions = {
            ...this._draftApplianceActions,
            [applianceId]: this._buildApplianceSeedDraft(applianceId),
        };
        this._overwriteMixedAppliances = nextOverwriteMixedAppliances;
        this._draftApplianceActions = nextDraftApplianceActions;
        this._applianceValidity = {
            ...this._applianceValidity,
            [applianceId]: true,
        };
        this._editedApplianceIds = this._buildEditedApplianceIds(
            nextDraftApplianceActions,
            nextOverwriteMixedAppliances,
        );
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
        const nextDraftApplianceActions = {
            ...this._draftApplianceActions,
            [applianceId]: this._cloneDraftApplianceAction(action),
        };
        this._draftApplianceActions = nextDraftApplianceActions;
        this._editedApplianceIds = this._buildEditedApplianceIds(
            nextDraftApplianceActions,
            this._overwriteMixedAppliances,
        );
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
        const inverter = this._buildEffectiveInverterAction();
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

    private _buildCurrentInverterAction(): ScheduleAction | null {
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

    private _buildEffectiveInverterAction(): ScheduleAction | null {
        const selectionSummary = this._selectionSummary?.inverter;
        if (!selectionSummary) {
            return null;
        }

        if (!this._isInverterEditorActive()) {
            return cloneScheduleInverterAction(selectionSummary.seedValue);
        }

        return this._buildCurrentInverterAction();
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

    private _updateInverterEditedState(): void {
        const selectionSummary = this._selectionSummary?.inverter;
        if (!selectionSummary) {
            this._inverterEdited = false;
            return;
        }

        if (selectionSummary.state === "mixed") {
            this._inverterEdited = this._overwriteMixedInverter;
            return;
        }

        const currentAction = this._buildCurrentInverterAction();
        this._inverterEdited = currentAction === null
            ? false
            : !areScheduleActionsEqual(currentAction, selectionSummary.seedValue);
    }

    private _isApplianceActionEdited(
        applianceId: string,
        nextAction: ScheduleApplianceAction | null,
        overwriteMixedAppliances: Record<string, boolean> = this._overwriteMixedAppliances,
    ): boolean {
        const summary = this._selectionSummary?.appliances[applianceId];
        if (!summary) {
            return false;
        }

        if (summary.state === "mixed") {
            return overwriteMixedAppliances[applianceId] ?? false;
        }

        const normalizedInitialAction = this._cloneDraftApplianceAction(summary.seedValue);
        const normalizedNextAction = this._cloneDraftApplianceAction(nextAction);
        return normalizedNextAction === null || normalizedInitialAction === null
            ? normalizedNextAction !== normalizedInitialAction
            : !areScheduleApplianceActionsEqual(normalizedNextAction, normalizedInitialAction);
    }

    private _buildEditedApplianceIds(
        draftApplianceActions: Record<string, ScheduleApplianceAction | null>,
        overwriteMixedAppliances: Record<string, boolean> = this._overwriteMixedAppliances,
    ): string[] {
        return Object.keys(this._selectionSummary?.appliances ?? {}).flatMap((applianceId) =>
            this._isApplianceActionEdited(
                applianceId,
                draftApplianceActions[applianceId] ?? null,
                overwriteMixedAppliances,
            )
                ? [applianceId]
                : [],
        );
    }

    private _cloneDraftApplianceAction(
        action: ScheduleApplianceAction | null,
    ): ScheduleApplianceAction | null {
        return action === null ? null : cloneScheduleApplianceAction(action);
    }

    private _inverterPanelClasses(): string {
        if (!this._isInverterEditorActive() || this._actionKind === null || this._actionKind === "empty") {
            return "panel";
        }

        const action = this._buildActionOptionPreview(this._actionKind);
        const presentation = getScheduleActionPresentation(action, this.localize);
        return `panel inverter-panel-highlight ${presentation.toneClass}`;
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

    private _isInverterEditorActive(): boolean {
        return this._selectionSummary !== null
            && (
                this._selectionSummary.inverter.state === "uniform"
                || this._overwriteMixedInverter
            );
    }

    private _isApplianceEditorActive(applianceId: string): boolean {
        const summary = this._selectionSummary?.appliances[applianceId];
        return summary === undefined || summary.state === "uniform" || (this._overwriteMixedAppliances[applianceId] ?? false);
    }

    private _resetInverterDraft(): void {
        const seedValue = this._selectionSummary?.inverter.seedValue;
        if (!seedValue) {
            return;
        }

        this._actionKind = seedValue.kind;
        this._targetSocInput = seedValue.targetSoc?.toString() ?? "";
    }

    private _buildApplianceSeedDraft(applianceId: string): ScheduleApplianceAction | null {
        return this._cloneDraftApplianceAction(
            this._selectionSummary?.appliances[applianceId]?.seedValue ?? null,
        );
    }

    private _buildMissingMixedApplianceIds(): string[] {
        const knownApplianceIds = new Set(this.appliances.map((appliance) => appliance.id));
        return Object.entries(this._selectionSummary?.appliances ?? {})
            .flatMap(([applianceId, summary]) =>
                !knownApplianceIds.has(applianceId) && summary.state === "mixed"
                    ? [applianceId]
                    : [],
            );
    }

    private _buildFallbackApplianceChipMetadata(
        applianceId: string,
        summary: ScheduleSelectionValueSummary<ScheduleApplianceAction | null>,
    ): Pick<ScheduleApplianceMetadata, "id" | "name" | "kind" | "icon"> {
        const firstAction = summary.distinctValues.find((option) => option.value !== null)?.value ?? null;
        if (firstAction !== null && isScheduleEvChargerAction(firstAction)) {
            return { id: applianceId, name: applianceId, kind: "ev_charger", icon: "mdi:car-electric" };
        }
        if (firstAction !== null && isScheduleClimateApplianceAction(firstAction)) {
            return { id: applianceId, name: applianceId, kind: "climate", icon: "mdi:air-conditioner" };
        }
        if (firstAction !== null && isScheduleGenericApplianceAction(firstAction)) {
            return { id: applianceId, name: applianceId, kind: "generic", icon: "mdi:power-plug" };
        }

        return { id: applianceId, name: applianceId, kind: "generic", icon: "mdi:flash-outline" };
    }
}
