import { DWMResolver } from "./DWMResolver.js";
import { addMethods } from "./methods.js";

Hooks.on("init", () => {
    CONFIG.Dice.fulfillment.methods[DWMResolver.METHOD] = {
        icon: "<i class=\"fa-solid fa-play\"></i>",
        interactive: true,
        label: "DICE.FULFILLMENT.DWMResolver",
        resolver: DWMResolver
    };
});

Hooks.on("diceSoNiceReady", (dice3d) => {
    // Needed by the rescoped showForRoll below
    //const Dice3D = dice3d.constructor;

    // Replace the PhysicsWorker with our own
    dice3d.box.physicsWorker.terminate();
    dice3d.box.physicsWorker = DWMResolver._physicsWorker;
    dice3d.DiceFactory.physicsWorker.terminate();
    dice3d.DiceFactory.physicsWorker = DWMResolver._physicsWorker;
    dice3d.box.initialize();

    //dice3d.box.swapDiceFace = () => {};

    // Embarassing magic trick. We recreate the showForRoll function to make it use our own DiceNotation class
    //let f;
    //dice3d.showForRoll = eval("f = function " + dice3d.showForRoll.toString()).bind(dice3d);

    addMethods(dice3d);
});

Hooks.on("diceSoNiceMessageProcessed", (chatMessageId, interception) => {
    // Prevent DSN interception of chat messages entirely
    interception.willTrigger3DRoll = false;
});