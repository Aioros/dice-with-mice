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

Hooks.on("ready", () => {
    const diceConfiguration = game.settings.get("core", "diceConfiguration");
    if (!Object.values(diceConfiguration).some(conf => conf === DWMResolver.METHOD) && !game.settings.get("dice-with-mice", "disableDiceConfigNotification")) {
        // The user doesn't have any dice configured to use DWM
        const diceConfigLink = `<a id="dwm_dice_config" href="#">` + game.i18n.localize("DWM.MESSAGES.DiceConfigLinkText") + "</a>";
        const disableNotificationLink = `<a id="dwm_disable_dice_config_notification" href="#">` + game.i18n.localize("DWM.MESSAGES.DisableNotificationText") + "</a>";
        const message = game.i18n.format("DWM.MESSAGES.DiceConfigInfo", {diceConfigLink, disableNotificationLink});
        const notification = ui.notifications.info(message, {localize: false, permanent: true});
        
        document.querySelector("#dwm_dice_config").addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const diceConfigClass = foundry.applications.settings?.menus?.DiceConfig ?? DiceConfig;
            const diceConfig = new diceConfigClass();
            diceConfig.render(true);
            return false;
        });
        document.querySelector("#dwm_disable_dice_config_notification").addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            game.settings.set("dice-with-mice", "disableDiceConfigNotification", true);
            notification.remove();
            return false;
        });
    }

});

Hooks.on("renderDiceConfig", (diceConfigApp, html, data, options) => {
    html = html.get?.(0) ?? html;
    const dwmAssignAll = document.createElement("div");
    dwmAssignAll.classList.add("form-group", "dwm-assign-all");
    const label = document.createElement("label");
    label.innerHTML = game.i18n.localize("DWM.APPLICATION.DiceConfig.AssignAllLabel");
    const button = document.createElement("button");
    button.innerHTML = game.i18n.localize("DWM.APPLICATION.DiceConfig.AssignAllButton");
    button.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        html.querySelectorAll(".form-group select").forEach(dice => { dice.value = DWMResolver.METHOD; });
        return false;
    });
    dwmAssignAll.appendChild(label);
    dwmAssignAll.appendChild(button);
    const firstFormGroup = html.querySelector(".window-content .form-group");
    firstFormGroup.parentElement.insertBefore(dwmAssignAll, firstFormGroup);
    diceConfigApp.setPosition({height: "auto"});
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