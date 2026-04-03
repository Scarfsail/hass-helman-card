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

            .chip-icon {
                flex-shrink: 0;
                color: var(--schedule-action-tone-icon, currentColor);
                --mdc-icon-size: 0.85rem;
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
        const classes = `chip action ${presentation.toneClass}${this.size === "compact" ? " compact" : ""}`;
        return html`
            <span class=${classes}>
                <ha-icon class="chip-icon" .icon=${presentation.icon} aria-hidden="true"></ha-icon>
                ${this.iconOnly ? nothing : html`
                    <span class="chip-label">${this.appliance.name} · ${presentation.label}</span>
                `}
            </span>
        `;
    }
}
