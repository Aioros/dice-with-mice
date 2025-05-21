import { DWMResolver } from "./DWMResolver.js";
import { DWMTracker } from "./DWMTracker.js";
import { addMethods } from "./methods.js";
import { DieTracker } from "./DieTracker.js";

customElements.define("dwm-die-tracker", DieTracker);

Hooks.on("init", () => {
    CONFIG.Dice.fulfillment.methods[DWMResolver.METHOD] = {
        icon: "<i class=\"fa-solid fa-play\"></i>",
        interactive: true,
        label: "DICE.FULFILLMENT.DWMResolver",
        resolver: DWMResolver
    };

    const tracker = new DWMTracker();
    game.socket.on("module.dice-with-mice", async ({type, payload}) => {
        if (!tracker.rendered) {
            await tracker.render(true);
        }
        tracker.updateDiceData(payload);
    });
});

Hooks.on("diceSoNiceReady", (dice3d) => {
    // Replace the PhysicsWorker with our own
    dice3d.box.physicsWorker.terminate();
    dice3d.box.physicsWorker = DWMResolver._physicsWorker;
    dice3d.DiceFactory.physicsWorker.terminate();
    dice3d.DiceFactory.physicsWorker = DWMResolver._physicsWorker;
    dice3d.box.initialize();

    addMethods(dice3d);
});

Hooks.on("diceSoNiceMessageProcessed", (chatMessageId, interception) => {
    // Prevent DSN interception of chat messages entirely
    interception.willTrigger3DRoll = false;
});