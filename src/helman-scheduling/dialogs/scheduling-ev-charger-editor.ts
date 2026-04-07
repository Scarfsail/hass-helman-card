import { LitElement, css, html, type PropertyValues } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleEvChargerApplianceMetadata } from "../model/schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";
import { isScheduleEvChargerAction } from "../schedule-types";
import type { ScheduleApplianceActionChangeDetail } from "./schedule-appliance-editor-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

type EvChargerEditorMode = "none" | "charge";
type EvChargerOptionPresentation = {
    icon: string;
    label: string;
    toneClass: "action-tone-neutral" | "action-tone-charge";
};

@customElement("scheduling-ev-charger-editor")
export class SchedulingEvChargerEditor extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .appliance-panel {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--secondary-background-color);
            }

            .appliance-header {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .action-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .action-option-card {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--card-background-color);
                cursor: pointer;
                transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
            }

            .action-option-card:hover {
                border-color: color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 40%, var(--divider-color));
            }

            .action-option-card.selected {
                border-color: var(--schedule-action-tone-accent, var(--primary-color));
                background: color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 10%, var(--card-background-color));
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 18%, transparent);
            }

            .action-option-card:focus-within {
                outline: 2px solid var(--primary-color);
                outline-offset: 2px;
            }

            .action-option-header {
                display: flex;
                align-items: flex-start;
                gap: 10px;
            }

            .action-option-radio {
                flex-shrink: 0;
                margin-top: 2px;
            }

            .action-option-copy {
                display: flex;
                min-width: 0;
                flex: 1;
            }

            .action-option-detail {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding-left: 28px;
            }

            .preview-chip {
                box-sizing: border-box;
                width: 100%;
                min-width: 0;
                max-width: 100%;
                overflow: hidden;
                justify-content: flex-start;
            }

            .preview-icon {
                flex-shrink: 0;
                color: var(--schedule-action-tone-icon, currentColor);
                --mdc-icon-size: 1rem;
            }

            .chip-label {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            @media (max-width: 600px) {
                .action-option-detail {
                    padding-left: 0;
                }
            }
        `,
    ];

    @property({ attribute: false }) public appliance?: ScheduleEvChargerApplianceMetadata;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public action: ScheduleApplianceAction | null = null;

    @state() private _mode: EvChargerEditorMode = "none";
    @state() private _vehicleId = "";
    @state() private _useMode = "";
    @state() private _ecoGear = "";

    protected willUpdate(changedProperties: PropertyValues<this>): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has("action") || changedProperties.has("appliance")) {
            this._applyAction(this.action);
        }
    }

    render() {
        if (!this.appliance) {
            return nothing;
        }

        const needsEcoGear = this._mode === "charge" && this._useMode === "ECO";
        return html`
            <div class="appliance-panel">
                <div class="appliance-header">
                    <div class="panel-title">${this.appliance.name}</div>
                    <div class="field-help">${this.localize("scheduling.dialog.appliance_kind.ev_charger")}</div>
                </div>

                <div class="action-options">
                    ${this._renderModeOption("none")}
                    ${this._renderModeOption("charge", html`
                        <div class="field">
                            <div class="field-label">${this.localize("scheduling.dialog.appliance.mode")}</div>
                            <select class="select-input" .value=${this._useMode} @change=${this._handleUseModeChange}>
                                ${this.appliance.scheduleCapabilities.useModes.map((mode) => html`
                                    <option value=${mode} ?selected=${this._useMode === mode}>${this._formatUseMode(mode)}</option>
                                `)}
                            </select>
                        </div>

                        ${needsEcoGear ? html`
                            <div class="field">
                                <div class="field-label">${this.localize("scheduling.dialog.appliance.eco_gear")}</div>
                                <select class="select-input" .value=${this._ecoGear} @change=${this._handleEcoGearChange}>
                                    ${this.appliance.scheduleCapabilities.ecoGears.map((gear) => html`
                                        <option value=${gear} ?selected=${this._ecoGear === gear}>${gear}</option>
                                    `)}
                                </select>
                            </div>
                        ` : nothing}

                        <div class="field">
                            <div class="field-label">${this.localize("scheduling.dialog.appliance.vehicle")}</div>
                            <select class="select-input" .value=${this._vehicleId} @change=${this._handleVehicleChange}>
                                ${this.appliance.vehicles.map((vehicle) => html`
                                    <option value=${vehicle.id} ?selected=${this._vehicleId === vehicle.id}>${vehicle.name}</option>
                                `)}
                            </select>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderModeOption(mode: EvChargerEditorMode, detailContent = nothing) {
        const checked = this._mode === mode;
        const presentation = this._buildModePresentation(mode);
        return html`
            <div class=${`action-option-card ${presentation.toneClass}${checked ? " selected" : ""}`} @click=${() => this._handleModeChange(mode)}>
                <label class="action-option-header">
                    <input
                        class="action-option-radio"
                        type="radio"
                        name=${`ev-schedule-mode-${this.appliance?.id ?? "unknown"}`}
                        value=${mode}
                        .checked=${checked}
                        @change=${() => this._handleModeChange(mode)}
                    />
                    <div class="action-option-copy">
                        <span class=${`chip action preview-chip ${presentation.toneClass}`}>
                            <ha-icon class="preview-icon" .icon=${presentation.icon} aria-hidden="true"></ha-icon>
                            <span class="chip-label">${presentation.label}</span>
                        </span>
                    </div>
                </label>
                ${checked && detailContent !== nothing ? html`
                    <div class="action-option-detail" @click=${this._stopPropagation}>
                        ${detailContent}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _applyAction(action: ScheduleApplianceAction | null): void {
        if (!this.appliance) {
            this._mode = "none";
            this._vehicleId = "";
            this._useMode = "";
            this._ecoGear = "";
            return;
        }

        if (action === null || !isScheduleEvChargerAction(action)) {
            this._mode = "none";
            this._vehicleId = this.appliance.vehicles[0]?.id ?? "";
            this._useMode = this.appliance.scheduleCapabilities.useModes[0] ?? "Fast";
            this._ecoGear = this.appliance.scheduleCapabilities.ecoGears[0] ?? "";
            return;
        }

        this._mode = action.charge ? "charge" : "none";
        this._vehicleId = action.vehicleId ?? this.appliance.vehicles[0]?.id ?? "";
        this._useMode = action.useMode ?? this.appliance.scheduleCapabilities.useModes[0] ?? "Fast";
        this._ecoGear = action.ecoGear ?? this.appliance.scheduleCapabilities.ecoGears[0] ?? "";
    }

    private _handleModeChange(mode: EvChargerEditorMode): void {
        if (!this.appliance) {
            return;
        }

        this._mode = mode;
        if (mode === "charge") {
            if (!this._vehicleId) {
                this._vehicleId = this.appliance.vehicles[0]?.id ?? "";
            }
            if (!this._useMode) {
                this._useMode = this.appliance.scheduleCapabilities.useModes[0] ?? "Fast";
            }
            if (!this._ecoGear) {
                this._ecoGear = this.appliance.scheduleCapabilities.ecoGears[0] ?? "";
            }
        }
        this._emitChange();
    }

    private _handleVehicleChange(event: Event): void {
        this._vehicleId = (event.currentTarget as HTMLSelectElement).value;
        this._emitChange();
    }

    private _handleUseModeChange(event: Event): void {
        this._useMode = (event.currentTarget as HTMLSelectElement).value;
        if (this._useMode === "ECO" && !this._ecoGear) {
            this._ecoGear = this.appliance?.scheduleCapabilities.ecoGears[0] ?? "";
        }
        this._emitChange();
    }

    private _handleEcoGearChange(event: Event): void {
        this._ecoGear = (event.currentTarget as HTMLSelectElement).value;
        this._emitChange();
    }

    private _stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    private _emitChange(): void {
        if (!this.appliance) {
            return;
        }

        const detail = this._buildDetail();
        this.dispatchEvent(new CustomEvent("schedule-appliance-action-change", {
            bubbles: true,
            composed: true,
            detail,
        }));
    }

    private _buildDetail(): ScheduleApplianceActionChangeDetail {
        if (!this.appliance) {
            return { applianceId: "", action: null, valid: false };
        }

        if (this._mode === "none") {
            return { applianceId: this.appliance.id, action: null, valid: true };
        }

        const validVehicle = this.appliance.scheduleCapabilities.requiresVehicleSelection
            ? this.appliance.vehicles.some((vehicle) => vehicle.id === this._vehicleId)
            : true;
        const validUseMode = this.appliance.scheduleCapabilities.useModes.includes(
            this._useMode as "Fast" | "ECO",
        );
        const validEcoGear = this._useMode !== "ECO"
            || this.appliance.scheduleCapabilities.ecoGears.includes(this._ecoGear);
        const valid = validVehicle && validUseMode && validEcoGear;

        return {
            applianceId: this.appliance.id,
            action: valid
                ? {
                    charge: true,
                    vehicleId: this._vehicleId || undefined,
                    useMode: this._useMode as "Fast" | "ECO",
                    ecoGear: this._useMode === "ECO" ? this._ecoGear : undefined,
                }
                : null,
            valid,
        };
    }

    private _formatUseMode(mode: "Fast" | "ECO"): string {
        return mode === "ECO"
            ? this.localize("scheduling.appliance.ev.mode.eco")
            : this.localize("scheduling.appliance.ev.mode.fast");
    }

    private _buildModePresentation(mode: EvChargerEditorMode): EvChargerOptionPresentation {
        if (!this.appliance) {
            return {
                icon: "mdi:circle-outline",
                label: "",
                toneClass: "action-tone-neutral",
            };
        }

        if (mode === "none") {
            return {
                icon: "mdi:circle-outline",
                label: this.localize("scheduling.dialog.appliance.no_action"),
                toneClass: "action-tone-neutral",
            };
        }

        return {
            icon: "mdi:car-electric",
            label: this.localize("scheduling.dialog.appliance.charge"),
            toneClass: "action-tone-charge",
        };
    }
}
