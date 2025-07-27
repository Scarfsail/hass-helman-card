import { LitElement, TemplateResult, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { keyed } from 'lit/directives/keyed.js';
import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";
import "./power-device";

@customElement("power-devices-container")
export class PowerDevicesContainer extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public devices!: DeviceNode[];
    @property({ type: Number }) public currentParentPower?: number;
    @property({ attribute: false }) public parentPowerHistory?: number[];
    @property({ type: Number }) public historyBuckets!: number;
    @property({ type: Number }) public historyBucketDuration!: number;
    @property({ type: Boolean }) public devices_full_width?: boolean;

    static get styles() {
        return css`
            .container {
                flex-basis: 100%;
                flex-wrap: wrap;
                padding-left: 20px; /* Aligns with the device name */
                gap: 5px; /* Optional: adds some space between children */
                display: flex;
            }
            .container.full-width {
                display: flex;
                flex-wrap: wrap;
                gap: 5px; /* Optional: adds some space between children */
            }
            .container.full-width > power-device {
                flex-grow: 1;
                flex-basis: 0;
                min-width: 150px; /* Optional: prevent children from becoming too small */
            }
        `;
    }

    render(): TemplateResult {
        return html`
            <div class="container ${this.devices_full_width ? 'full-width' : ''}" style="display: ${this.devices_full_width ? 'block' : ''};">
                ${this.devices.map((device) => keyed(device.name, html`
                    <power-device
                        .hass=${this.hass}
                        .device=${device}
                        .currentParentPower=${this.currentParentPower}
                        .parentPowerHistory=${this.parentPowerHistory}
                        .historyBuckets=${this.historyBuckets}
                        .historyBucketDuration=${this.historyBucketDuration}
                    ></power-device>
                `))}
            </div>
        `;
    }
}
