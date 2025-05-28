import { PhysicsWorkerWithPromise } from "../lib/PhysicsWorkerWithPromise.js";
import { deepProxy } from "./utils.js";

export class DWMResolver extends foundry.applications.dice.RollResolver {

    constructor(roll, options={}) {
        super(roll, options);
        
        // Proxy the results arrays to identify which one is being rerolled
        roll.dice.forEach(die => {
            die.results = deepProxy(die.results, (change) => {
                if (change.action === "set" && change.path.endsWith(".rerolled") && !change.previousValue && change.newValue) {
                    die.results.forEach((result, i) => {
                        result.lastRerolled = (parseInt(change.path.split(".")[0]) === i);
                    });
                }
            });
        });
    }

    static _physicsWorker;
    static {
        this._physicsWorker = new PhysicsWorkerWithPromise({workerUrl: new URL("../lib/DSN/PhysicsWorker.js", import.meta.url), workerName: "PhysicsWorker"});
    }

    static METHOD = "dwmResolver";

    static DWM_RESOLVER_STATES = {
        INACTIVE: 0,
        READY: 1,
        ROLLING: 2,
    }

    static get instances() {
        return [...foundry.applications.instances.values()].filter(i => i instanceof DWMResolver);
    }

    static DEFAULT_OPTIONS = {
        id: "dwm-resolver-{id}",
        tag: "form",
        classes: ["dwm-roll-resolver"],
        window: {
            title: "DWM.APPLICATION.DWMResolver.AppTitle",
        },
        position: {
            width: 500,
            height: "auto",
            top: 3000
        },
        form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: this._fulfillRoll
        },
        actions: {
            spawnDice: DWMResolver.spawnDiceAction
        }
    };

    static PARTS = {
        header: {
            id: "header",
            template: "modules/dice-with-mice/templates/roll-resolver-header.hbs"
        },
        form: {
            id: "form",
            template: "modules/dice-with-mice/templates/roll-resolver-form.hbs"
        }
    };

    // Called with `this` bound to instance
    static async spawnDiceAction() {
        return this.spawnDice();
    }

    /** @inheritDoc */
    async _prepareContext(_options) {
        const context = await super._prepareContext(_options);
        context.rollDisabled = this.throwerState >= DWMResolver.DWM_RESOLVER_STATES.READY;

        Object.values(context.groups).forEach(g => {
            g.method = g.results[0].method;
        });

        return context;
    }

    #positionSaveTimeout = null;
    savePosition(pos) {
        game.settings.set("dice-with-mice", "resolverPosition", { top: pos.top, left: pos.left });
    }

    /** @inheritDoc */
    setPosition(position) {
        const pos = super.setPosition(position);
        if (this.#positionSaveTimeout) {
            clearTimeout(this.#positionSaveTimeout);
            this.#positionSaveTimeout = null;
        }
        this.#positionSaveTimeout = setTimeout(() => { this.savePosition(pos); }, 1000);
        return pos;
    }

    /** @inheritDoc */
    _initializeApplicationOptions(options) {
        const applicationOptions = super._initializeApplicationOptions(options);
        applicationOptions.position.top = game.settings.get("dice-with-mice", "resolverPosition")?.top ?? applicationOptions.position.top;
        applicationOptions.position.left = game.settings.get("dice-with-mice", "resolverPosition")?.left ?? applicationOptions.position.left;
        return applicationOptions;
    }

    throwerState;
    #submitting;

    get broadcastTargets() {
        let broadcastTargets;
        const rollMode = game.settings.get("core", "rollMode"); // PUBLIC, SELF, or PRIVATE. BLIND is not interactive.
        const activeUsers = game.users.filter(u => u.active && !u.isSelf);

        if (rollMode === CONST.DICE_ROLL_MODES.PUBLIC || !game.settings.get("dice-so-nice", "hide3dDiceOnSecretRolls")) {
            broadcastTargets = activeUsers.map(u => ({user: u.id}));
        } else {
            if (game.settings.get("dice-so-nice", "showGhostDice") === "1") {
                broadcastTargets = activeUsers.map(u => ({user: u.id, ghost: rollMode === CONST.DICE_ROLL_MODES.SELF || !u.isGM}));
            } else {
                broadcastTargets = activeUsers.filter(u => u.isGM && rollMode === CONST.DICE_ROLL_MODES.PRIVATE).map(u => ({user: u.id}));
            }
        }
        return broadcastTargets;
    }

    get physicsWorker() {
        return this.constructor._physicsWorker;
    }

    get throwable() {
        return [...this.fulfillable.values().filter(f => f.method === DWMResolver.METHOD)];
    }

    getFilledInputs(name) {
        const selector = "input" + (name ? `[name="${name}"]` : "");
        return [...this.element.querySelectorAll(selector)].filter(input => input.value);
    }

    getEmptyInputs(name) {
        const selector = "input" + (name ? `[name="${name}"]` : "");
        return [...this.element.querySelectorAll(selector)].filter(input => input.value === "");
    }

    async setThrowerState(newState) {
        this.throwerState = newState;
        await this.render({ parts: ["header"] });
    }

    async spawnDice(term) {
        const resolver = this;

        game.dice3d.box.currentResolver = resolver;

        if (this.throwable.length) {
            const dice = term ? [term] : this.throwable.map(t => t.term);
            const preRoll = {dice};

            // Place the dice under the mouse
            await this.setThrowerState(DWMResolver.DWM_RESOLVER_STATES.READY);
            // Prevent the physics world from sleeping until the dice is actually thrown
            await DWMResolver._physicsWorker.exec("allowSleeping", {allow: false});

            game.dice3d.activateListeners();
            game.dice3d.preRoll(preRoll)
                .then(() => {
                    resolver.throwingDice = game.dice3d.box.diceList.map(d => d.id);
                });

            DWMResolver._physicsWorker.off("worldAsleep");
            DWMResolver._physicsWorker.on("worldAsleep", async () => {
                if (this.throwerState === DWMResolver.DWM_RESOLVER_STATES.ROLLING) {
                    //console.log("Manual throw done");
                    await this.setThrowerState(DWMResolver.DWM_RESOLVER_STATES.INACTIVE); // this disables additional manual throws; could think of something like a minimum roll time
                    game.dice3d.deactivateListeners();

                    for (const dsnDie of game.dice3d.box.diceList) {
                        const resultDSNDice = [dsnDie];
                        const fvttDie = preRoll.dice.find(d => d._id === dsnDie.options._originalId);
                        dsnDie.result = await DWMResolver._physicsWorker.exec("getDiceValue", dsnDie.id);
                        if (fvttDie.faces === 100) {
                            if (dsnDie.notation.type === "d10") continue;
                            dsnDie.result = dsnDie.result % 10 * 10;
                            const d10ofd100 = game.dice3d.box.diceList.find(d => d.options._originalId === dsnDie.options._originalId && d.options._index === dsnDie.options._index && d.id !== dsnDie.id);
                            resultDSNDice.push(d10ofd100);
                            const d10Value = await DWMResolver._physicsWorker.exec("getDiceValue", d10ofd100.id);
                            dsnDie.result += d10Value % 10;
                            dsnDie.d100result = dsnDie.result;
                            d10ofd100.d100result = dsnDie.result;
                        }
                        this.registerDSNResult(DWMResolver.METHOD, resultDSNDice);
                    }

                    resolver.throwingDice = [];
                    game.dice3d.box.endDiceBroadcast();
                    game.dice3d.box.clearDice();
                }
            });

        }
    }

    async awaitFulfillment() {
        this.throwerState = DWMResolver.DWM_RESOLVER_STATES.INACTIVE;

        const originalPromise = super.awaitFulfillment();

        if (!this.constructor.instances.length) {
            this.spawnDice();
        }
        
        return originalPromise;
    }

    registerDSNResult(method, dsnDice) {
        const dsnDie = dsnDice[0];
        const query = `label[data-denomination="${dsnDie.notation.type}"][data-method="${method}"] > input:not(:disabled)`;
        const input = Array.from(this.element.querySelectorAll(query)).find(input => input.value === "");
        input.value = `${dsnDie.result}`;
        input.dataset.dsnDiceId = JSON.stringify(dsnDice.map(d => d.id));
        const submitInput = input.closest(".form-fields")?.querySelector("button");
        if ( submitInput ) submitInput.dispatchEvent(new MouseEvent("click"));
        else this._checkDone();
        return true;
    }

    async close(options={}) {
        if (this.#submitting) {
            // All done, run effects and aftershow
            game.dice3d.box.diceList = [...game.dice3d.box.deadDiceList];
            game.dice3d.box.deadDiceList = [];
            game.dice3d.box.assignSpecialEffects();
            game.dice3d.box.handleSpecialEffectsInit().then(() => game.dice3d._afterShow());
            
            const results = game.dice3d.box.diceList.map(d => ({id: d.id, result: d.result}));
            game.socket.emit("module.dice-with-mice", { type: "rollCompleted", payload: { user: game.user.id, results, broadcastTargets: this.broadcastTargets } });
        } else {
            await this.reset();
        }

        return super.close(options);
    }

    async _onSubmitForm(formConfig, event) {
        this.#submitting = true;
        DWMResolver._physicsWorker.off("worldAsleep");
        return super._onSubmitForm(formConfig, event);
    }

    async reset() {
        this.throwingDice = [];
        game.socket.emit("module.dice-with-mice", { type: "rollCanceled", payload: { user: game.user.id, broadcastTargets: this.broadcastTargets } });
        DWMResolver._physicsWorker.off("worldAsleep");
        game.dice3d.deactivateListeners();
        await game.dice3d.box.clearAll();
        await this.setThrowerState(DWMResolver.DWM_RESOLVER_STATES.INACTIVE);
        if (canvas.mouseInteractionManager) {
            canvas.mouseInteractionManager.activate();
        }
    }

    async resolveResult(term, method, { reroll=false, explode=false }={}) {
        console.log("resolveResult", term, method, reroll, explode);
        if (method === DWMResolver.METHOD) {
            this.element.querySelectorAll(`input[name="${term._id}"]:disabled`).forEach((input, i) => {
                term.results[i].dsnDiceId = JSON.parse(input.dataset.dsnDiceId ?? "[]");
            });
            if (reroll || explode) {
                this.spawnDice(term);
            }
        }
        return super.resolveResult(term, method, { reroll, explode });
    }

    static async _fulfillRoll(event, form, formData) {
        // Update the DiceTerms with the fulfilled values.
        // This also adds DSN die information to each result, to allow removal of the latest rerolled die
        for ( let [id, results] of Object.entries(formData.object) ) {
            const { term } = this.fulfillable.get(id);
            if ( !Array.isArray(results) ) results = [results];
            if (form) { // _fulfillRole is also called on close, with no event or form
                results.forEach((result, i) => {
                    const input = form.querySelectorAll(`input[name="${id}"]`)[i];
                    const roll = { result: undefined, active: true, dsnDiceId: JSON.parse(input.dataset.dsnDiceId ?? "[]")};
                    // A null value indicates the user wishes to skip external fulfillment and fall back to the digital roll.
                    if ( result === null ) roll.result = term.randomFace();
                    else roll.result = result;
                    term.results.push(roll);
                });
            }
        }
    }

}