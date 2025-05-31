const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DWMTracker extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(options={}) {
        super(options);
        this.#data = {};
        this.savePosition = foundry.utils.debounce((pos) => game.settings.set("dice-with-mice", "trackerPosition", { top: pos.top, left: pos.left }), 100);
    }

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        id: "dwm-tracker-{id}",
        tag: "div",
        classes: ["dwm-tracker"],
        window: {
            title: "DWM.APPLICATION.DWMTracker.AppTitle",
        },
        position: {
            width: "auto",
            height: "auto"
        },
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

    #data = {};

    get displayTracker() {
        return !game.settings.get("dice-with-mice", "hideTracker");
    }

    /** @inheritDoc */
    async _prepareContext(_options) {
        const context = await super._prepareContext(_options);
        context.data = this.#data;
        return context;
    }

    /** @inheritDoc */
    setPosition(position) {
        const pos = super.setPosition(position);
        this.savePosition(pos);
        return pos;
    }

    /** @inheritDoc */
    _initializeApplicationOptions(options) {
        const applicationOptions = super._initializeApplicationOptions(options);
        applicationOptions.position.top = game.settings.get("dice-with-mice", "trackerPosition")?.top ?? applicationOptions.position.top;
        applicationOptions.position.left = game.settings.get("dice-with-mice", "trackerPosition")?.left ?? applicationOptions.position.left;
        return applicationOptions;
    }

    listen() {
        game.socket.on("module.dice-with-mice", async ({type, payload}) => {
            console.log(type, payload);
            const target = payload.broadcastTargets.find(t => t.user === game.user.id);
            if (!target) return;

            if (type !== "rollCanceled") {
                if (this.displayTracker && !this.rendered && !this.#renderQueued) {
                    this.#renderQueued = true;
                    this.#semaphore.add(this.render.bind(this), true)
                        .then(() => { this.#renderQueued = false; });
                }
            }

            switch (type) {
                case "updateDice":
                    this.#semaphore.add(this.updateDiceData.bind(this), payload);
                    break;
                case "rollCompleted":
                    this.#semaphore.add(this.completeRoll.bind(this), payload.user, payload.results);
                    break;
                case "rollCanceled":
                    this.#semaphore.add(this.cancelRoll.bind(this), payload);
            }
        });
    }

    updateDiceData(newData) {
        const ghost = newData.broadcastTargets.find(t => t.user === game.user.id).ghost;

        if (!this.#data[newData.user]) {
            this.#data[newData.user] = {name: game.users.get(newData.user).name, dice: {}};
            if (this.displayTracker) {
                this.addUser(newData.user);
            }
        }
        Object.keys(newData.dice).forEach(dieId => {
            if (!this.#data[newData.user].dice[dieId]) {
                newData.dice[dieId].options = JSON.stringify(foundry.utils.mergeObject(JSON.parse(newData.dice[dieId].options), { ghost }));
                if (this.displayTracker) {
                    this.addDie(newData.user, dieId, newData.dice[dieId].type, newData.dice[dieId].options);
                }
                this.#data[newData.user].dice[dieId] = {};
            }
            this.#data[newData.user].dice[dieId] = foundry.utils.mergeObject(this.#data[newData.user].dice[dieId], newData.dice[dieId]);
            if (this.displayTracker) {
                this.updateDie(newData.user, dieId, newData.dice[dieId]);
            }
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
        tracker.dataset.options = options;
        if (JSON.parse(options).replace) {
            tracker.classList.add("rerolled");
            const replaceTracker = this.element.querySelector(`fieldset[data-user-id="${user}"]:not(.completed) dwm-die-tracker[data-die-id="${JSON.parse(options).replace}"]`);
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
        if (this.displayTracker) {
            const fieldset = this.element.querySelector(`fieldset[data-user-id="${user}"]`);
            fieldset.classList.add("completed");
            fieldset.addEventListener("dieCompleted", (evt) => {
                const notCompleted = fieldset.querySelectorAll("dwm-die-tracker:not(:state(complete))");
                if (!notCompleted.length) {
                    // All dice tracker completed
                    setTimeout(() => {
                        this.removeRoll(user);
                    }, 3000); // should be a setting
                }
            });
            fieldset.querySelectorAll("dwm-die-tracker").forEach(tracker => {
                tracker.setAttribute("result", results.find(r => r.id == tracker.dataset.dieId)?.result);
            });
        }
    }

    cancelRoll(data) {
        delete this.#data[data.user];
        if (this.displayTracker) {
            this.removeRoll(data.user);
        }
    }

    removeRoll(user) {
        const fieldset = this.element?.querySelector(`fieldset[data-user-id="${user}"]`);
        if (fieldset) {
            fieldset.remove();
        }
        if (this.element?.querySelectorAll("fieldset[data-user-id]").length === 0) {
            this.close();
        }
    }
}