import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleIntervalRowModel } from "../schedule-types";
import "./scheduling-interval-row";

@customElement("scheduling-day-section")
export class SchedulingDaySection extends LitElement {
    static styles = css`
        :host {
            display: block;
        }

        .day-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .day-heading {
            color: var(--secondary-text-color);
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .day-rows {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    `;

    @property({ type: String }) public dayLabel = "";
    @property({ attribute: false }) public rows: ScheduleIntervalRowModel[] = [];
    @property({ attribute: false }) public expandedIntervalIds: string[] = [];
    @property({ attribute: false }) public selectedSlotIdsByInterval: Record<string, string[]> = {};
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: Boolean }) public busy = false;
    @property({ type: Boolean }) public executionEnabled = false;

    render() {
        return html`
            <div class="day-section">
                <div class="day-heading">${this.dayLabel}</div>
                <div class="day-rows">
                    ${this.rows.map((row) => html`
                        <scheduling-interval-row
                            .row=${row}
                            .expanded=${this.expandedIntervalIds.includes(row.id)}
                            .selectedSlotIds=${this.selectedSlotIdsByInterval[row.id] ?? []}
                            .localize=${this.localize}
                            .busy=${this.busy}
                            .executionEnabled=${this.executionEnabled}
                        ></scheduling-interval-row>
                    `)}
                </div>
            </div>
        `;
    }
}
