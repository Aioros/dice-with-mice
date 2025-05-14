import { DiceNotation as CustomDiceNotation } from "./DiceNotation.js";
import { DiceNotation } from "../lib/foundryvtt-dice-so-nice/module/DiceNotation.js";

const methods = {
    dice3d: {
        activateListeners() {
            // Add some necessary listeners if not already there because of a DSN setting
            if (!game.settings.get("dice-so-nice", "allowInteractivity")) {
                const mouseNDC = (event) => {
                    let rect = this.canvas[0].getBoundingClientRect();
                    let x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    if (x > 1)
                        x = 1;
                    let y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
                    return { x: x, y: y };
                };
                $(document).off(".dicesonice");
                $(document).on("mousemove.dicesonice", "body", async (event) => {
                    await this.box.onMouseMove(event, mouseNDC(event));
                });
                $(document).on("mousedown.dicesonice", "body", async (event) => {
                    await this.box.onMouseDown(event, mouseNDC(event));
                    this._beforeShow();
                });
                $(document).on("mouseup.dicesonice", "body", async (event) => {
                    await this.box.onMouseUp(event);
                    //this._afterShow();
                });    
            }
        },

        deactivateListeners() {
            if (!game.settings.get("dice-so-nice", "allowInteractivity")) {
                const hideCanvasAndClear = () => {
                    const config = game.dice3d.constructor.CONFIG();
                    if (!config.hideAfterRoll && this.canvas.is(":visible") && !this.box.rolling) {
                        this.canvas.hide();
                        this.box.clearAll();
                    }
                }
                $(document).off(".dicesonice");
                $(document).on("mousedown.dicesonice", "body", async (event) => {
                    hideCanvasAndClear();
                });    
            }
        },

        async preRoll(roll, callback) {
            const Dice3D = this.constructor;
            const notation = new CustomDiceNotation(roll, Dice3D.ALL_CONFIG(game.user), game.user);
            notation.dsnConfig = Dice3D.ALL_CUSTOMIZATION(game.user, this.DiceFactory);
            notation.throws.forEach(t => { t.dsnConfig = notation.dsnConfig; });

            for (const die of roll.dice) {
                const rerolledDiceId = die.results.find(r => r.lastRerolled)?.dsnDiceId || [];
                const rerolledDsnDice = [...this.box.diceList, ...this.box.deadDiceList].filter(d => rerolledDiceId.includes(d.id));
                for (const rerolledDsnDie of rerolledDsnDice) {
                    //console.log("removing die " + rerolledDsnDie.id + "; result was: " + rerolledDsnDie.result);
                    this.box.scene.remove(rerolledDsnDie.parent.type === "Scene" ? rerolledDsnDie : rerolledDsnDie.parent);
                    this.box.diceList = this.box.diceList.filter(d => d.id !== rerolledDsnDie.id);
                    this.box.deadDiceList = this.box.deadDiceList.filter(d => d.id !== rerolledDsnDie.id);
                    await this.box.physicsWorker.exec("removeDice", [rerolledDsnDie.id]);
                }
            }

            this.box.clearDice();
            this.box.renderScene();
            this._beforeShow();
            await this.box.preThrow(notation.throws, callback);
        }
    },

    diceBox: {
        async onMouseDown(event, ndc) {
            if (!!this.currentResolver?.throwerState) return true;
            return this.constructor.prototype.onMouseDown.call(this, event, ndc);
        },

        async onMouseUp(event) {
            if (this.currentResolver && this.currentResolver.throwerState === this.currentResolver.constructor.DSNTHROWER_STATES.READY) {
                await this.currentResolver.setThrowerState(this.currentResolver?.constructor.DSNTHROWER_STATES.ROLLING);
                await this.physicsWorker.exec("allowSleeping", true);
            }
            this.constructor.prototype.onMouseUp.call(this, event);
            return false;
        },

        getPreThrowVectors(notationVectors) {
            for (let i = 0; i < notationVectors.dice.length; i++) {
                const diceobj = this.dicefactory.get(notationVectors.dice[i].type);
                notationVectors.dice[i].vectors = {
                    type: diceobj.type,
                    pos: {x: 0 + 50*i, y: this.display.containerHeight * -0.9 + 50*i, z: 200},
                    velocity: {x: 0, y: 0, z: 0},
                    angle: {x: 0.1, y: 0.1, z: 0.1},
                    axis: {x: 0, y: 0, z: 0, a: 0}
                };
            }
            return notationVectors;
        },

        async preThrow(throws, callback) {
            this.isVisible = true;

            //this.clearDice();

            throws.forEach(notation => {
                notation = this.getPreThrowVectors(notation);
            });

            for (let j = 0; j < throws.length; j++) {
                let notationVectors = throws[j];
                for (let i = 0, len = notationVectors.dice.length; i < len; ++i) {
                    notationVectors.dice[i].startAtIteration = j * this.nbIterationsBetweenRolls;
                    let appearance = this.dicefactory.getAppearanceForDice(notationVectors.dsnConfig.appearance, notationVectors.dice[i].type, notationVectors.dice[i]);
                    await this.spawnDice(notationVectors.dice[i], appearance);
                }
            }

            for (let die of this.diceList) {
                await this.physicsWorker.exec("addConstraint", { id: die.id, pos: {x: 5, y: this.display.containerHeight * -0.9 + 5, z: 200} }); // Slightly offset the constraint so that the die is not too static
            }
            this.mouse.constraint = true;
            this.mouse.constraintDown = true;
            if (canvas.mouseInteractionManager) {
				canvas.mouseInteractionManager.object.interactive = false;
            }

            // animateThrow needs each dice to have a `sim` property to accept new positions
            const combinedDiceList = [...this.diceList, ...this.deadDiceList];
            combinedDiceList.forEach(dice => { dice.sim = {}; });

            this.iteration = 0;

            this.callback = callback;
            this.throws = throws;
            
            this.removeTicker(this.animateThrow);
            canvas.app.ticker.add(this.animateThrow, this);
        }    
    }
};

export function addMethods(dice3d) {
    dice3d.activateListeners = methods.dice3d.activateListeners.bind(dice3d);
    dice3d.deactivateListeners = methods.dice3d.deactivateListeners.bind(dice3d);
    dice3d.preRoll = methods.dice3d.preRoll.bind(dice3d);
    dice3d.box.onMouseDown = methods.diceBox.onMouseDown.bind(dice3d.box);
    dice3d.box.onMouseUp = methods.diceBox.onMouseUp.bind(dice3d.box);
    dice3d.box.preThrow = methods.diceBox.preThrow.bind(dice3d.box);
    dice3d.box.getPreThrowVectors = methods.diceBox.getPreThrowVectors.bind(dice3d.box);
}