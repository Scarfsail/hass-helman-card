import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import { getScheduleApplianceActionPresentation } from "../model/schedule-appliance-action-presentation";
import type { ScheduleApplianceMetadata } from "../model/schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

@customElement("scheduling-appliance-chip")
export class SchedulingApplianceChip extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            :host {
                display: inline-flex;
                min-width: 0;
                max-width: 100%;
            }

            .chip {
                box-sizing: border-box;
                width: 100%;
                min-width: 0;
                max-width: 100%;
                overflow: hidden;
                justify-content: flex-start;
            }

            .chip.compact {
                min-height: 20px;
                padding: 2px 6px;
                font-size: 0.75rem;
                line-height: 1.1;
                gap: 4px;
            }

            .chip.compact.has-badge {
                padding-top: 4px;
                padding-right: 9px;
            }

            .chip-icon {
                flex-shrink: 0;
                color: var(--schedule-action-tone-icon, currentColor);
                --mdc-icon-size: 0.85rem;
            }

            .chip-icon-stack {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                inline-size: 1rem;
                block-size: 1rem;
                flex-shrink: 0;
            }

            .chip-icon-badge {
                position: absolute;
                inset-block-start: -0.12rem;
                inset-inline-end: -0.18rem;
                z-index: 1;
                min-width: 0.78rem;
                padding: 0 0.16rem;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.65);
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
                color: white;
                font-size: 0.52rem;
                font-weight: 700;
                line-height: 1.25;
                text-align: center;
                white-space: nowrap;
                pointer-events: none;
            }

            .chip-label {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `,
    ];

    @property({ attribute: false }) public appliance?: ScheduleApplianceMetadata;
    @property({ attribute: false }) public action?: ScheduleApplianceAction;
    @property({ attribute: false }) public expectedVehicleSocPct: number | null = null;
    @property({ attribute: false }) public localize?: LocalizeFunction;
    @property({ type: String }) public size: "compact" | "regular" = "regular";
    @property({ type: Boolean }) public iconOnly = false;

    render() {
        if (!this.appliance || !this.action || !this.localize) {
            return nothing;
        }

        const presentation = getScheduleApplianceActionPresentation({
            appliance: this.appliance,
            action: this.action,
            localize: this.localize,
        });
        const expectedVehicleSocPct = this._resolveExpectedVehicleSocPct();
        const classes = [
            "chip",
            "action",
            presentation.toneClass,
            this.size === "compact" ? "compact" : "",
            expectedVehicleSocPct === null ? "" : "has-badge",
        ].filter((className) => className.length > 0).join(" ");
        return html`
            <span class=${classes}>
                <span class="chip-icon-stack">
                    <ha-icon class="chip-icon" .icon=${presentation.icon} aria-hidden="true"></ha-icon>
                    ${expectedVehicleSocPct === null ? nothing : html`
                        <span
                            class="chip-icon-badge"
                            title=${this._buildExpectedVehicleSocTitle(expectedVehicleSocPct)}
                            aria-hidden="true"
                        >
                            ${expectedVehicleSocPct}
                        </span>
                    `}
                </span>
                ${this.iconOnly ? nothing : html`
                    <span class="chip-label">${this.appliance.name} · ${presentation.label}</span>
                `}
            </span>
        `;
    }

    private _resolveExpectedVehicleSocPct(): number | null {
        if (
            this.appliance?.kind !== "ev_charger"
            || this.action?.charge !== true
            || typeof this.expectedVehicleSocPct !== "number"
            || !Number.isFinite(this.expectedVehicleSocPct)
        ) {
            return null;
        }

        return Math.max(0, Math.min(100, Math.round(this.expectedVehicleSocPct)));
    }

    private _buildExpectedVehicleSocTitle(expectedVehicleSocPct: number): string {
        return `${this.localize?.("scheduling.appliance.ev.expected_soc") ?? "Expected vehicle SoC"} ${expectedVehicleSocPct}%`;
    }
}
