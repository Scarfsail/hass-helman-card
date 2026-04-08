import { LitElement, css, html, type PropertyValues } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleGenericApplianceMetadata } from "../model/schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";
import { isScheduleGenericApplianceAction } from "../schedule-types";
import type { ScheduleApplianceActionChangeDetail } from "./schedule-appliance-editor-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

type GenericApplianceEditorMode = "none" | "on";
type GenericApplianceOptionPresentation = {
    icon: string;
    label: string;
    toneClass: "action-tone-neutral" | "action-tone-charge";
};

@customElement("scheduling-generic-appliance-editor")
export class SchedulingGenericApplianceEditor extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .appliance-panel {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 10px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--secondary-background-color);
            }

            .action-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .action-option-card {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px;
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
                align-items: center;
                gap: 8px;
            }

            .action-option-radio {
                flex-shrink: 0;
                margin-top: 0;
            }

            .action-option-copy {
                display: flex;
                min-width: 0;
                flex: 1;
            }

            .preview-chip {
                box-sizing: border-box;
                width: 100%;
                min-width: 0;
                max-width: 100%;
                overflow: hidden;
                justify-content: flex-start;
                min-height: 20px;
                padding: 2px 6px;
                font-size: 0.75rem;
                line-height: 1.1;
                gap: 4px;
            }

            .preview-icon {
                flex-shrink: 0;
                color: var(--schedule-action-tone-icon, currentColor);
                --mdc-icon-size: 0.85rem;
            }

            .chip-label {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        `,
    ];

    @property({ attribute: false }) public appliance?: ScheduleGenericApplianceMetadata;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public action: ScheduleApplianceAction | null = null;

    @state() private _mode: GenericApplianceEditorMode = "none";

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

        return html`
            <div class=${`appliance-panel${this.action !== null ? " panel-highlight-success" : ""}`}>
                <div class="appliance-header panel-header-inline">
                    <div class="panel-title">${this.appliance.name}</div>
                    <div class="field-help">${this.localize("scheduling.dialog.appliance_kind.generic")}</div>
                </div>

                <div class="action-options">
                    ${this._renderModeOption("none")}
                    ${this._renderModeOption("on")}
                </div>
            </div>
        `;
    }

    private _renderModeOption(mode: GenericApplianceEditorMode) {
        const checked = this._mode === mode;
        const presentation = this._buildModePresentation(mode);
        return html`
            <div class=${`action-option-card ${presentation.toneClass}${checked ? " selected" : ""}`} @click=${() => this._handleModeChange(mode)}>
                <label class="action-option-header">
                    <input
                        class="action-option-radio"
                        type="radio"
                        name=${`generic-schedule-mode-${this.appliance?.id ?? "unknown"}`}
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
            </div>
        `;
    }

    private _applyAction(action: ScheduleApplianceAction | null): void {
        if (!this.appliance || action === null || !isScheduleGenericApplianceAction(action)) {
            this._mode = "none";
            return;
        }

        this._mode = action.on ? "on" : "none";
    }

    private _handleModeChange(mode: GenericApplianceEditorMode): void {
        this._mode = mode;
        this._emitChange();
    }

    private _emitChange(): void {
        if (!this.appliance) {
            return;
        }

        this.dispatchEvent(new CustomEvent("schedule-appliance-action-change", {
            bubbles: true,
            composed: true,
            detail: this._buildDetail(),
        }));
    }

    private _buildDetail(): ScheduleApplianceActionChangeDetail {
        if (!this.appliance) {
            return { applianceId: "", action: null, valid: false };
        }

        return {
            applianceId: this.appliance.id,
            action: this._mode === "on" ? { on: true } : null,
            valid: true,
        };
    }

    private _buildModePresentation(mode: GenericApplianceEditorMode): GenericApplianceOptionPresentation {
        if (mode === "none") {
            return {
                icon: "mdi:circle-outline",
                label: this.localize("scheduling.dialog.appliance.no_action"),
                toneClass: "action-tone-neutral",
            };
        }

        return {
            icon: "mdi:power-plug",
            label: this.localize("scheduling.dialog.appliance.turn_on"),
            toneClass: "action-tone-charge",
        };
    }
}
