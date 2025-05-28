import { DWMResolver } from "./DWMResolver.js";
import { DWMTracker } from "./DWMTracker.js";
import { addMethods } from "./methods.js";
import { DieTracker } from "./DieTracker.js";
import { registerSettings } from "./settings.js";

customElements.define("dwm-die-tracker", DieTracker);

let tracker;

Hooks.on("init", () => {
    registerSettings();
    
    CONFIG.Dice.fulfillment.methods[DWMResolver.METHOD] = {
        icon: "<i class=\"fa-solid fa-play\"></i>",
        interactive: true,
        label: "DWM.FULFILLMENT.ResolverName",
        resolver: DWMResolver
    };

    tracker = new DWMTracker();
    tracker.listen();
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

Hooks.on("userConnected", (user, connected) => {
    if (!connected && tracker.rendered) {
        tracker.cancelRoll({user: user.id});
    }
});

["renderPlayerList", "renderPlayers"].forEach(hookName => {
    Hooks.on(hookName, (playerList, html, data) => {
        html = html.get?.(0) ?? html;
        const hideTrackerSetting = game.settings.get("dice-with-mice", "hideTracker");
        const button = document.createElement("span");
        button.id = "toggleDWMTracker";
        button.dataset.tooltip = `DWM.APPLICATION.PlayerListToggleTooltip.${hideTrackerSetting ? "Show" : "Hide"}`;//hideTrackerSetting ? "DWM.APPLICATION.PlayerListToggleTooltip.Show" : "Hide Dice Tracker";
        button.classList.add("fa-solid", "fa-dice", hideTrackerSetting ? "hiding" : "showing");
        button.addEventListener("click", (evt) => {
            game.settings.set("dice-with-mice", "hideTracker", !hideTrackerSetting).then(() => playerList.render());
            evt.preventDefault();
            evt.stopPropagation();
            return false;
        });
        const location = html.querySelector("h3") || html.querySelector(".player.self");
        location.appendChild(button);
    });
});