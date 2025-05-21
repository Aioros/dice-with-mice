const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DWMTracker extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(options={}) {
        super(options);
        this.#data = {};
    }

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        id: "dwm-tracker-{id}",
        tag: "div",
        classes: ["roll-resolver"],
        window: {
            title: "DICE.DWMTrackerTitle",
        },
        position: {
            width: 500,
            height: "auto"
        },
        /*form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: this._fulfillRoll
        }*/
    };

    /** @override */
    static PARTS = {
        main: {
            id: "main",
            template: "modules/dice-with-mice/templates/roll-tracker.hbs"
        }
    };

    #data = {}; // not sure yet if we need this

    /** @inheritDoc */
    async _prepareContext() {
        const context = {
            data: this.#data
        }
        return context;
    }

    updateDiceData(data) {
        if (!this.#data[data.user]) {
            this.#data[data.user] = {dice: {}};
            this.addUser(data.user);
        }
        Object.keys(data.dice).forEach(dieId => {
            if (!this.#data[data.user].dice[dieId]) {
                this.addDie(data.user, dieId, data.dice[dieId].type);
            }
            this.#data[data.user].dice[dieId] = data.dice[dieId];
            this.updateDie(data.user, dieId, data.dice[dieId]);
        });
    }

    addUser(id) {
        const fieldset = document.createElement("fieldset");
        fieldset.classList.add("input-grid");
        fieldset.dataset.userId = id;
        fieldset.innerHTML = `<legend>${id}</legend>`;
        this.element.querySelector(".dwm-tracker-container").appendChild(fieldset);
    }

    addDie(user, id, type) {
        const tracker = document.createElement("dwm-die-tracker");
        tracker.classList.add("dwm-result");
        tracker.dataset.dieId = id;
        tracker.dataset.type = type;
        this.element.querySelector(`fieldset[data-user-id="${user}"]`).appendChild(tracker);
    }

    updateDie(user, id, data) {
        const tracker = this.element.querySelector(`fieldset[data-user-id="${user}"] dwm-die-tracker[data-die-id="${id}"]`);
        tracker.setAttribute("quaternion", JSON.stringify(data.quaternion));
    }
}