import { LitElement, css, html } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import { getLocalizeFunction, type LocalizeFunction } from "../localize/localize";
import { HelmanForecastCardConfig } from "./HelmanForecastCardConfig";
import "../helman-simple/node-detail/helman-forecast-detail";

@customElement("helman-forecast-card")
export class HelmanForecastCard extends LitElement implements LovelaceCard {

    // 1. Static HA configuration methods
    public static async getStubConfig(_hass: HomeAssistant): Promise<Partial<HelmanForecastCardConfig>> {
        return { type: "custom:helman-forecast-card" };
    }

    public static getConfigForm() {
        return {
            schema: [
                {
                    name: "transparent_background",
                    selector: { boolean: {} },
                },
            ],
        };
    }

    // 2. Static styles
    static styles = css`
        :host { display: block; }
        ha-card { overflow: hidden; }
        ha-card.transparent {
            background: transparent;
            box-shadow: none;
            border: none;
        }
        .card-content {
            padding: 12px;
        }
    `;

    // 3. Private properties
    private _config!: HelmanForecastCardConfig;
    private _localize?: LocalizeFunction;

    // 5. State properties
    @state() private _hass?: HomeAssistant;

    // 7. HA-specific property setter
    public set hass(value: HomeAssistant) {
        this._hass = value;
        if (!this._localize) this._localize = getLocalizeFunction(value);
    }

    // 8. HA-specific methods
    getCardSize() { return 3; }

    setConfig(config: HelmanForecastCardConfig) {
        this._config = { ...config };
    }

    // 10. Render method
    render() {
        if (!this._hass || !this._localize) {
            return html`
                <ha-card class=${this._config?.transparent_background ? "transparent" : ""}>
                </ha-card>
            `;
        }

        return html`
            <ha-card class=${this._config?.transparent_background ? "transparent" : ""}>
                <div class="card-content">
                    <helman-forecast-detail
                        .hass=${this._hass}
                        .localize=${this._localize}
                    ></helman-forecast-detail>
                </div>
            </ha-card>
        `;
    }
}

// Card registration
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: "helman-forecast-card",
    name: "Helman Forecast Card",
    description: "Standalone solar and grid forecast visualization.",
    preview: true,
});
