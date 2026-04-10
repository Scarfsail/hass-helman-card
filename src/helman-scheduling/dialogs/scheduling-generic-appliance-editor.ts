import { LitElement, css, html, type PropertyValues } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleGenericApplianceMetadata } from "../model/schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";
import { isScheduleGenericApplianceAction } from "../schedule-types";
import type { ScheduleApplianceActionChangeDetail } from "./schedule-appliance-editor-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

type GenericApplianceEditorMode = "none" | "off" | "on";
type GenericApplianceOptionPresentation = {
    icon: string;
    label: string;
    toneClass: "action-tone-neutral" | "action-tone-charge" | "action-tone-stop";
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
                flex-wrap: wrap;
                gap: 8px;
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
            <div class=${`appliance-panel${this._panelHighlightClass()}`}>
                <div class="appliance-header panel-header-inline">
                    <div class="panel-title">${this.appliance.name}</div>
                    <div class="field-help">${this.localize("scheduling.dialog.appliance_kind.generic")}</div>
                </div>

                <div class="action-options compact-action-options">
                    ${this._renderModeOption("none")}
                    ${this._renderModeOption("off")}
                    ${this._renderModeOption("on")}
                </div>
            </div>
        `;
    }

    private _renderModeOption(mode: GenericApplianceEditorMode) {
        const checked = this._mode === mode;
        const presentation = this._buildModePresentation(mode);
        return html`
            <label class="compact-action-option">
                <input
                    class="sr-only"
                    type="radio"
                    name=${`generic-schedule-mode-${this.appliance?.id ?? "unknown"}`}
                    value=${mode}
                    .checked=${checked}
                    aria-label=${presentation.label}
                    @change=${() => this._handleModeChange(mode)}
                />
                <span class=${`chip action preview-chip selectable ${presentation.toneClass}${checked ? " selected" : ""}`}>
                    <ha-icon class="preview-icon" .icon=${presentation.icon} aria-hidden="true"></ha-icon>
                    <span class="chip-label">${presentation.label}</span>
                </span>
            </label>
        `;
    }

    private _applyAction(action: ScheduleApplianceAction | null): void {
        if (!this.appliance || action === null || !isScheduleGenericApplianceAction(action)) {
            this._mode = "none";
            return;
        }

        this._mode = action.on ? "on" : "off";
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
            action: this._mode === "none"
                ? null
                : { on: this._mode === "on" },
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

        if (mode === "off") {
            return {
                icon: "mdi:power-plug-off",
                label: this.localize("scheduling.dialog.appliance.turn_off"),
                toneClass: "action-tone-stop",
            };
        }

        return {
            icon: "mdi:power-plug",
            label: this.localize("scheduling.dialog.appliance.turn_on"),
            toneClass: "action-tone-charge",
        };
    }

    private _panelHighlightClass(): string {
        if (this._mode === "on") {
            return " panel-highlight-success";
        }
        if (this._mode === "off") {
            return " panel-highlight-stop";
        }
        return "";
    }
}
