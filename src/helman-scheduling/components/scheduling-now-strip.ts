import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import { getScheduleActionLabel, getScheduleErrorLabel, getScheduleReasonLabel } from "../model/schedule-labels";
import type { ScheduleNowStripModel } from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

@customElement("scheduling-now-strip")
export class SchedulingNowStrip extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .now-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px 12px;
            }

            .now-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-width: 0;
            }

            .now-runtime {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
        `,
    ];

    @property({ attribute: false }) public now: ScheduleNowStripModel | null = null;
    @property({ type: Boolean }) public executionEnabled = false;
    @property({ attribute: false }) public localize!: LocalizeFunction;

    render() {
        if (this.now === null) {
            return html`
                <div class="panel">
                    <div class="panel-title">${this.localize("scheduling.now.title")}</div>
                    <div class="muted">${this.localize("scheduling.now.unavailable")}</div>
                </div>
            `;
        }

        const reasonLabel = getScheduleReasonLabel(this.now.runtime?.reason, this.localize);
        return html`
            <div class="panel">
                <div class="panel-title">
                    ${this.localize("scheduling.now.title")} ${this.now.rangeLabel}
                </div>
                <div class="now-grid">
                    <div class="now-item">
                        <div class="field-label">${this.localize("scheduling.now.scheduled")}</div>
                        <div class="chip action">${getScheduleActionLabel(this.now.scheduledAction, this.localize)}</div>
                    </div>
                    <div class="now-item">
                        <div class="field-label">${this.localize("scheduling.now.running")}</div>
                        <div class="now-runtime">${this._renderRuntime()}</div>
                    </div>
                    ${reasonLabel ? html`
                        <div class="now-item">
                            <div class="field-label">${this.localize("scheduling.now.reason")}</div>
                            <div class="chip reason">${reasonLabel}</div>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }

    private _renderRuntime() {
        if (!this.executionEnabled) {
            return html`<div class="chip disabled">${this.localize("scheduling.now.execution_disabled")}</div>`;
        }

        if (this.now?.runtime === null) {
            return html`<div class="muted">${this.localize("scheduling.now.runtime_unavailable")}</div>`;
        }

        if (this.now?.runtime?.status === "error") {
            return html`
                <div class="chip error">
                    ${getScheduleErrorLabel({
                        code: this.now.runtime.errorCode,
                        fallbackMessage: this.localize("scheduling.runtime.error"),
                        localize: this.localize,
                    })}
                </div>
                ${this.now.runtime.executedAction ? html`
                    <div class="chip runtime">
                        ${getScheduleActionLabel(this.now.runtime.executedAction, this.localize)}
                    </div>
                ` : nothing}
            `;
        }

        if (this.now?.runtime?.executedAction) {
            return html`
                <div class="chip runtime">
                    ${getScheduleActionLabel(this.now.runtime.executedAction, this.localize)}
                </div>
            `;
        }

        return html`<div class="chip runtime">${this.localize("scheduling.runtime.applied")}</div>`;
    }
}
