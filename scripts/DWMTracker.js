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
            width: "auto",
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

    /**
     * A Semaphore used to enqueue asynchronous operations.
     * @type {Semaphore}
     */
    #semaphore = new foundry.utils.Semaphore(1);
    #renderQueued = false;

    #data = {}; // not sure yet if we need this

    listen() {
        game.socket.on("module.dice-with-mice", async ({type, payload}) => {
            if (!this.rendered && !this.#renderQueued) {
                this.#renderQueued = true;
                this.#semaphore.add(this.render.bind(this), true)
                    .then(() => { this.#renderQueued = false; });
            }

            switch (type) {
                case "updateDice":
                    this.#semaphore.add(this.updateDiceData.bind(this), payload);
                    break;
                case "rollCompleted":
                    this.#semaphore.add(this.completeRoll.bind(this), payload.user, payload.results);
                    break;
            }
        });
    }

    updateDiceData(newData) {
        if (!this.#data[newData.user]) {
            this.#data[newData.user] = {dice: {}};
            this.addUser(newData.user);
        }
        Object.keys(newData.dice).forEach(dieId => {
            if (!this.#data[newData.user].dice[dieId]) {
                this.addDie(newData.user, dieId, newData.dice[dieId].type, newData.dice[dieId].options);
                this.#data[newData.user].dice[dieId] = {};
            }
            this.#data[newData.user].dice[dieId] = foundry.utils.mergeObject(this.#data[newData.user].dice[dieId], newData.dice[dieId]);
            this.updateDie(newData.user, dieId, newData.dice[dieId]);
        });
    }

    addUser(id) {
        const fieldset = document.createElement("fieldset");
        fieldset.classList.add("dwm-results");
        fieldset.dataset.userId = id;
        fieldset.innerHTML = `<legend>${game.users.get(id).name}</legend>`;
        this.element.querySelector(".dwm-tracker-container").appendChild(fieldset);
    }

    addDie(user, id, type, options) {
        const tracker = document.createElement("dwm-die-tracker");
        tracker.classList.add("dwm-result");
        tracker.dataset.userId = user;
        tracker.dataset.dieId = id;
        tracker.dataset.type = type;
        tracker.dataset.options = JSON.stringify(options);
        if (options.replace) {
            tracker.classList.add("rerolled");
            const replaceTracker = this.element.querySelector(`fieldset[data-user-id="${user}"]:not(.completed) dwm-die-tracker[data-die-id="${options.replace}"]`);
            if (replaceTracker) {
                replaceTracker.replaceWith(tracker);
            }
        } else {
            this.element.querySelector(`fieldset[data-user-id="${user}"]:not(.completed)`).appendChild(tracker);
        }
    }

    updateDie(user, id, data) {
        const tracker = this.element.querySelector(`fieldset[data-user-id="${user}"]:not(.completed) dwm-die-tracker[data-die-id="${id}"]`);
        if (data.quaternion) {
            tracker.setAttribute("quaternion", JSON.stringify(data.quaternion));
        }
    }

    completeRoll(user, results) {
        //console.log("completeRoll", user, results);
        delete this.#data[user];
        const fieldset = this.element.querySelector(`fieldset[data-user-id="${user}"]`);
        fieldset.classList.add("completed");
        fieldset.addEventListener("dieCompleted", (evt) => {
            const notCompleted = fieldset.querySelectorAll("dwm-die-tracker:not(:state(complete))");
            if (!notCompleted.length) {
                // All dice tracker completed
                setTimeout(() => {
                    fieldset.remove();
                    if (this.element.querySelectorAll("fieldset[data-user-id]").length === 0) {
                        this.close();
                    }
                }, 3000); // should be a setting
            }
        });
        fieldset.querySelectorAll("dwm-die-tracker").forEach(tracker => {
            tracker.setAttribute("result", results.find(r => r.id == tracker.dataset.dieId)?.result);
        });
    }
}