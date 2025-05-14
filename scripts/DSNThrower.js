import { PhysicsWorkerWithPromise } from "./PhysicsWorkerWithPromise.js";
import { deepProxy } from "./utils.js";

export class DSNThrower extends foundry.applications.dice.RollResolver {

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
        this._physicsWorker = new PhysicsWorkerWithPromise({workerUrl: new URL("PhysicsWorker.js", import.meta.url), workerName: "PhysicsWorker"});
    }

    static METHOD = "dsnThrower";

    static DSNTHROWER_STATES = {
        INACTIVE: 0,
        READY: 1,
        ROLLING: 2,
    }

    static get instances() {
        return [...foundry.applications.instances.values()].filter(i => i instanceof DSNThrower);
    }

    static DEFAULT_OPTIONS = {
        id: "dsn-thrower-{id}",
        tag: "form",
        classes: ["roll-resolver"],
        window: {
            title: "DICE.DSNThrowerRollResolution",//"DICE.RollResolution"
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
            spawnDice: DSNThrower.spawnDiceAction
        }
    };

    static PARTS = {
        form: {
            id: "form",
            template: "modules/dice-thrower/templates/roll-resolver.hbs"
        }
    };

    static async spawnDiceAction() {
        return this.spawnDice();
    }

    async _prepareContext(_options) {
        const context = await super._prepareContext(_options);
        context.rollDisabled = this.throwerState >= DSNThrower.DSNTHROWER_STATES.READY;
        return context;
    }

    throwerState;

    get physicsWorker() {
        return this.constructor._physicsWorker;
    }

    get throwable() {
        return [...this.fulfillable.values().filter(f => f.method === DSNThrower.METHOD)];
    }

    getFilledInputs(name) {
        const selector = "input" + (name ? `[name="${name}"]` : "");
        return [...this.element.querySelectorAll(selector)].filter(input => input.value);
    }

    getEmptyInputs(name) {
        const selector = "input" + (name ? `[name="${name}"]` : "");
        return [...this.element.querySelectorAll(selector)].filter(input => input.value === "");
    }

    async setThrowerState(newState) { // probably doesn't need to be async anymore, check the awaits after
        this.throwerState = newState;
        // something here to enable/disable roll buttons and similar
        //await this.render();
    }

    async spawnDice(term) {
        const resolver = this;

        game.dice3d.box.currentResolver = resolver;

        if (this.throwable.length) {
            const dice = term ? [term] : this.throwable.map(t => t.term);
            const preRoll = {dice};

            // Place the dice under the mouse
            await this.setThrowerState(DSNThrower.DSNTHROWER_STATES.READY);
            // Prevent the physics world from sleeping until the dice is actually thrown
            await DSNThrower._physicsWorker.exec("allowSleeping", {allow: false});

            game.dice3d.activateListeners();
            game.dice3d.preRoll(preRoll);

            DSNThrower._physicsWorker.off("worldAsleep");
            DSNThrower._physicsWorker.on("worldAsleep", async () => {
                if (this.throwerState === DSNThrower.DSNTHROWER_STATES.ROLLING) {
                    //console.log("Manual throw done");
                    await this.setThrowerState(DSNThrower.DSNTHROWER_STATES.INACTIVE); // this disables additional manual throws; could think of something like a minimum roll time
                    game.dice3d.deactivateListeners();

                    for (const dsnDie of game.dice3d.box.diceList) {
                        const resultDSNDice = [dsnDie];
                        const fvttDie = preRoll.dice.find(d => d._id === dsnDie.options._originalId);
                        dsnDie.result = await DSNThrower._physicsWorker.exec("getDiceValue", dsnDie.id);
                        if (fvttDie.faces === 100) {
                            if (dsnDie.notation.type === "d10") continue;
                            dsnDie.result = dsnDie.result % 10 * 10;
                            const d10ofd100 = game.dice3d.box.diceList.find(d => d.options._originalId === dsnDie.options._originalId && d.options._index === dsnDie.options._index && d.id !== dsnDie.id);
                            resultDSNDice.push(d10ofd100);
                            const d10Value = await DSNThrower._physicsWorker.exec("getDiceValue", d10ofd100.id);
                            dsnDie.result += d10Value % 10;
                        }
                        this.registerDSNResult(DSNThrower.METHOD, resultDSNDice);
                    }

                    // Autosubmit if all done
                    setTimeout(() => {
                        //console.log(game.dice3d.box.diceList);
                        //this._checkDone();
                    }, 2000); // this timer should be a setting
                }
            });

        }
    }

    async awaitFulfillment() {
        this.throwerState = DSNThrower.DSNTHROWER_STATES.INACTIVE;

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
        //const submitInput = input.closest(".form-fields")?.querySelector("button");
        //if ( submitInput ) submitInput.dispatchEvent(new MouseEvent("click"));
        //else this._checkDone();
        return true;
    }

    async close(options={}) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super.close(options);
    }

    async _onSubmitForm(formConfig, event) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super._onSubmitForm(formConfig, event);
    }

    async resolveResult(term, method, { reroll=false, explode=false }={}) {
        this.element.querySelectorAll(`input[name="${term._id}"]:disabled`).forEach((input, i) => {
            term.results[i].dsnDiceId = JSON.parse(input.dataset.dsnDiceId);
        });
        this.spawnDice(term);
        return super.resolveResult(term, method, { reroll, explode });
    }

    static async _fulfillRoll(event, form, formData) {
        // Update the DiceTerms with the fulfilled values.
        for ( let [id, results] of Object.entries(formData.object) ) {
            const { term } = this.fulfillable.get(id);
            if ( !Array.isArray(results) ) results = [results];
            if (form) {
                results.forEach((result, i) => {
                    const input = form.querySelectorAll(`input[name="${id}"]`)[i];
                    const roll = { result: undefined, active: true, dsnDiceId: JSON.parse(input.dataset.dsnDiceId)};
                    // A null value indicates the user wishes to skip external fulfillment and fall back to the digital roll.
                    if ( result === null ) roll.result = term.randomFace();
                    else roll.result = result;
                    term.results.push(roll);
                });
            }
        }
    }

}