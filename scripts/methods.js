import { DiceNotation as DWMDiceNotation } from "../lib/DSN/DiceNotation.js";
import { MODULE_NAME } from "./settings.js";
import { libWrapper } from "../lib/libWrapper.js";

let broadcastInterval;

export const methods = {
    dice3d: {
        activateListeners() {
            // Add some necessary listeners if not already there because of a DSN setting
            //if (!game.settings.get("dice-so-nice", "allowInteractivity")) {
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
                    if (event.button === 2) {
                        this.box.currentResolver.reset();
                    } else {
                        await this.box.onMouseDown(event, mouseNDC(event));
                        this._beforeShow();
                    }
                });
                $(document).on("mouseup.dicesonice", "body", async (event) => {
                    await this.box.onMouseUp(event);
                });
            //}
        },

        deactivateListeners() {
            //if (!game.settings.get("dice-so-nice", "allowInteractivity")) {
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
            //}
        },

        async preRoll(roll, callback) {
            const Dice3D = this.constructor;
            const notation = new DWMDiceNotation(roll, Dice3D.ALL_CONFIG(game.user), game.user);
            notation.dsnConfig = Dice3D.ALL_CUSTOMIZATION(game.user, this.DiceFactory);
            notation.throws.forEach(t => {
                t.dsnConfig = notation.dsnConfig;
                t.dice.forEach(d => { d.options.dsnConfig = notation.dsnConfig });
            });

            let allRerolledDiceId = [];
            for (const die of roll.dice) {
                const rerolledDiceId = die.results.find(r => r.lastRerolled)?.dsnDiceId || [];
                allRerolledDiceId.push(...rerolledDiceId);
                this.box.removeDice(rerolledDiceId);
            }

            this.box.clearDice();
            this.box.renderScene();
            this._beforeShow();
            
            await this.box.preThrow(notation.throws, callback, allRerolledDiceId);
        }
    },

    diceBox: {
        /**
         * @override
         */
        async onMouseDown(originalOnMouseDown, event, ndc) {
            if (!!this.currentResolver?.throwerState) return true;
            return originalOnMouseDown.call(this, event, ndc);
        },

        /**
         * @override
         */
        async onMouseUp(originalOnMouseUp, event) {
            if (this.currentResolver && this.currentResolver.throwerState === this.currentResolver.constructor.DWM_RESOLVER_STATES.READY) {
                await this.currentResolver.setThrowerState(this.currentResolver?.constructor.DWM_RESOLVER_STATES.ROLLING);
                await this.physicsWorker.exec("allowSleeping", true);
                
                this.startDiceBroadcast();
            }
            originalOnMouseUp.call(this, event);
            return false;
        },

        startDiceBroadcast() {
            broadcastInterval = setInterval(this.sendDiceBroadcast.bind(this), 1000/30);
        },

        endDiceBroadcast() {
            clearInterval(broadcastInterval);
        },

        sendDiceBroadcast() {
            const data = {user: game.user.id, dice: {}, broadcastTargets: this.currentResolver.broadcastTargets };
            this.currentResolver.throwingDice.forEach(id => {
                const group = this.scene.children.find(c => c.children[0]?.id === id);
                if (group) {
                    data.dice[id] = {type: group.children[0].notation.type, position: group.position, quaternion: group.quaternion};
                }
            });
            game.socket.emit("module.dice-with-mice", {type: "updateDice", payload: data});
        },

        async removeDice(ids) {
            const removedDsnDice = [...this.diceList, ...this.deadDiceList].filter(d => ids.includes(d.id));
            for (const removedDsnDie of removedDsnDice) {
                this.scene.remove(removedDsnDie.parent.type === "Scene" ? removedDsnDie : removedDsnDie.parent);
                this.diceList = this.diceList.filter(d => d.id !== removedDsnDie.id);
                this.deadDiceList = this.deadDiceList.filter(d => d.id !== removedDsnDie.id);
                await this.physicsWorker.exec("removeDice", [removedDsnDie.id]);
            }
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
        
        async preThrow(throws, callback, allRerolledDiceId) {
            this.isVisible = true;

            throws.forEach(notation => {
                notation = this.getPreThrowVectors(notation);
            });

            for (let j = 0; j < throws.length; j++) {
                let notationVectors = throws[j];
                for (let i = 0, len = notationVectors.dice.length; i < len; ++i) {
                    notationVectors.dice[i].startAtIteration = j * this.nbIterationsBetweenRolls;
                    let appearance = this.dicefactory.getAppearanceForDice(notationVectors.dsnConfig.appearance, notationVectors.dice[i].type, notationVectors.dice[i]);
                    await this.spawnDice(notationVectors.dice[i], appearance);
                    const dieId = this.diceList[this.diceList.length - 1].id;
                    const options = notationVectors.dice[i].options;
                    if (allRerolledDiceId.length > i) { // This covers the d100 situation, each die only replaces one of the originals
                        options.replace = allRerolledDiceId[i];
                    }
                    const dieData = { options: JSON.stringify(options), type: notationVectors.dice[i].type }; // We pre-stringify the options to make it easier on the tracker's template side
                    const payload = {
                        user: game.user.id,
                        dice: {[dieId]: dieData},
                        broadcastTargets: this.currentResolver.broadcastTargets
                    };
                    
                    game.socket.emit("module.dice-with-mice", { type: "updateDice", payload });
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
        },

        assignSpecialEffects() {
            // Base logic originally in DiceNotation.mergeQueuedRollCommands (changed very little)

            // We need some prep to bring missing info into the actual dsn dice
            if (this.currentResolver) {
                this.currentResolver.roll.dice.forEach(fvttDie => {
                    fvttDie.results.forEach(result => {
                        if (result.discarded) {
                            const dsnDice = this.diceList.filter(d => result.dsnDiceId.includes(d.id));
                            dsnDice.forEach(dsnDie => {
                                dsnDie.discarded = true;
                            })
                        }
                    });
                });
            }

            //Retrieve the sfx list (unfiltered) for this throw. We do not know yet if these sfx should be visible or not            
            for (let k=0; k<this.diceList.length; k++) {
                const dsnDie = this.diceList[k];
                let sfxList = dsnDie.options.dsnConfig.specialEffects;

                //attach SFX that should trigger for this roll
                //For each sfx configured
                let specialEffects = Object.values(sfxList).filter(sfx => {
                    //if the dice is discarded, it should not trigger a special fx
                    if (dsnDie.discarded) // STILL MISSING
                        return false;
                    
                    //if the dice is a ghost dice, it should not trigger a special fx
                    if (dsnDie.options.ghost)
                        return false;

                    //if the special effect "onResult" list contains non-numeric value, we manually deal with them here
                    let manualResultTrigger = false;
                    //Keep Highest. Discarded dice are already filtered out
                    if (sfx.onResult.includes("kh"))
                        manualResultTrigger = dsnDie.options?.modifiers?.includes("kh");
                    //Keep Lowest. Discarded dice are already filtered out
                    if (sfx.onResult.includes("kl"))
                        manualResultTrigger = dsnDie.options?.modifiers?.includes("kl");

                    if (manualResultTrigger)
                        return true;

                    //if the result is in the triggers value, we keep the fx. Special case: double d10 for a d100 roll
                    if (sfx.diceType == "d100"){
                        if (dsnDie.d100Result && sfx.onResult.includes(dsnDie.d100Result.toString()))
                            return true;
                    } else {
                        if (sfx.diceType == dsnDie.notation.type && sfx.onResult.includes(dsnDie.result.toString()))
                            return true;
                    }
                        
                    //if a special effect was manually triggered for this dice, we also include it
                    if (dsnDie.options.sfx && dsnDie.options.sfx.id == sfx.diceType && sfx.onResult.includes(dsnDie.options.sfx.result.toString()))
                        return true;

                    return false;
                });
                //Now that we have a filtered list of sfx to play, we make a final list of all sfx for this die and we remove the duplicates
                if (dsnDie.options.sfx && dsnDie.options.sfx.specialEffect)
                    specialEffects.push({
                        specialEffect: dsnDie.options.sfx.specialEffect,
                        options: dsnDie.options.sfx.options
                    });
                if (specialEffects.length) {
                    //remove duplicate
                    specialEffects = specialEffects.filter((v, i, a) => a.indexOf(v) === i);
                    dsnDie.specialEffects = specialEffects;
                }
            }
        }
    }
};

export function addMethods(dice3d) {

    Object.keys(methods.dice3d).forEach(key => {
        if (!dice3d[key]) {
            dice3d.constructor.prototype[key] = methods.dice3d[key];
        } else {
            libWrapper.register(MODULE_NAME, `game.dice3d.constructor.prototype.${key}`, methods.dice3d[key], "WRAPPER");
        }
    });
    Object.keys(methods.diceBox).forEach(key => {
        if (!dice3d.box[key]) {
            dice3d.box.constructor.prototype[key] = methods.diceBox[key];
        } else {
            libWrapper.register(MODULE_NAME, `game.dice3d.box.constructor.prototype.${key}`, methods.diceBox[key], "WRAPPER");
        }
    });

}