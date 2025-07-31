import { LitElement, TemplateResult, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { DeviceNode } from "./DeviceNode";

@customElement("power-device-history-bars")
export class PowerDeviceHistoryBars extends LitElement {
    @property({ attribute: false }) public device!: DeviceNode;
    @property({ attribute: false }) public historyToRender!: number[];
    @property({ type: Number }) public maxHistoryPower!: number;
    @property({ type: String }) public historyBarColor!: string;

    static get styles() {
        return css`
            .historyContainer {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                flex-direction: row;
                align-items: flex-end;
                pointer-events: none;
                overflow: hidden;
                border-radius: 10px;
                z-index: 1;
            }
            .historyBarContainer {
                flex-grow: 1;
                display: flex;
                flex-direction: column-reverse; /* To stack from bottom up */
            }
            .historyBarSegment {
                width: 100%;
            }
        `;
    }

    render(): TemplateResult {
        return html`
            <div class="historyContainer">
                ${this.historyToRender.map((p, i) => {
                    const hPercentage = this.maxHistoryPower > 0 ? (p / this.maxHistoryPower) * 100 : 0;
                    const sourceHistory = this.device.sourcePowerHistory?.[i];
                    const hasSourceHistory = !this.device.isSource && sourceHistory && Object.keys(sourceHistory).length > 0;

                    return html`
                        <div class="historyBarContainer" style="height: ${Math.min(100, hPercentage)}%;">
                            ${hasSourceHistory
                                ? Object.values(sourceHistory).map(s => {
                                    const segmentPercentage = p > 0 ? (s.power / p) * 100 : 0;
                                    return html`<div class="historyBarSegment" style="height: ${segmentPercentage}%; background-color: ${s.color};"></div>`;
                                })
                                : html`<div class="historyBarSegment" style="height: 100%; background-color: ${this.historyBarColor};"></div>`
                            }
                        </div>`;
                })}
            </div>
        `;
    }
}
