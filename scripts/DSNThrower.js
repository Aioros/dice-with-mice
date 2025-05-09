import { PhysicsWorkerWithPromise } from "./PhysicsWorkerWithPromise.js";

export class DSNThrower extends foundry.applications.dice.RollResolver {

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
        /*form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: this._fulfillRoll
        }*/
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

    async spawnDice() {
        const resolver = this;

        game.dice3d.box.currentResolver = resolver;

        if (this.throwable.length) {
            const plus = new foundry.dice.terms.OperatorTerm({ operator: "+" });
            const dice = this.throwable.map(t => t.term);
            let termList = dice.map((e, i) => i < dice.length - 1 ? [e, plus] : [e]).reduce((a, b) => a.concat(b));
            
            const preRoll = CONFIG.Dice.rolls[0].fromTerms(termList);

            // Place the dice under the mouse
            await this.setThrowerState(DSNThrower.DSNTHROWER_STATES.READY);
            // Prevent the physics world from sleeping until the dice is actually thrown
            await DSNThrower._physicsWorker.exec("allowSleeping", {allow: false});

            game.dice3d.preRoll(preRoll);

            DSNThrower._physicsWorker.off("worldAsleep");
            DSNThrower._physicsWorker.on("worldAsleep", async () => {
                if (this.throwerState === DSNThrower.DSNTHROWER_STATES.ROLLING) {
                    //console.log("Manual throw done");
                    await this.setThrowerState(DSNThrower.DSNTHROWER_STATES.INACTIVE); // this disables additional manual throws; could think of something like a minimum roll time

                    for (const die of preRoll.dice) {
                        // If we're rerolling/exploding, it's always just one die
                        const diceAmount = die.results.length ? 1 : die.number;
                        for (let i=0; i<diceAmount; i++) {
                            const filledInputs = this.getFilledInputs(die._id);//[...resolver.element.querySelectorAll(`input[name="${die._id}"]`)].filter(input => input.value);
                            const input = [...resolver.element.querySelectorAll(`input[name="${die._id}"]`)][filledInputs.length];
                            const dsnDice = game.dice3d.box.diceList.filter(d => d.options._originalId === die._id && d.options._index === i);
                            let result = 0;
                            for (let dsnDie of dsnDice) {
                                const originalPhysicsValue = await DSNThrower._physicsWorker.exec("getDiceValue", dsnDie.id);
                                let multiplier = 1;
                                if (die.faces === 100) {
                                    if (originalPhysicsValue === 10) {
                                        multiplier = 0;
                                    }
                                    if (dsnDie.notation.type === "d100") {
                                        multiplier *= 10;
                                    }
                                }
                                result += multiplier * originalPhysicsValue;
                            }
                            input.value = result || 100;
                        }
                    }

                    // Autosubmit if all done
                    this._checkDone();
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

    async close(options={}) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super.close(options);
    }

    async _onSubmitForm(formConfig, event) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super._onSubmitForm(formConfig, event);
    }

    async resolveResult(term, method, { reroll=false, explode=false }={}) {
        this.spawnDice();
        return super.resolveResult(term, method, { reroll, explode });
    }

}