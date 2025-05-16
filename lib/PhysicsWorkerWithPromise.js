export class PhysicsWorkerWithPromise {
    constructor(options) {
        this.idCounter = 0;
        this.worker = new Worker(options.workerUrl, { name: options.workerName, type: "module" });
        this.actionHandlerMap = {events: {}, messages: {}};
        this.worker.onmessage = this.onmessage.bind(this);
    }
    onmessage(e) {
        const { id, payload } = e.data;
        if (this.actionHandlerMap.messages[id]) {
            this.actionHandlerMap.messages[id].call(this, payload);
            delete this.actionHandlerMap.messages[id];
        } else if (this.actionHandlerMap.events[id]) {
            this.actionHandlerMap.events[id].forEach(handler => {
                handler.call(this, payload);
            });
        }
    }

    postMessage(action) {
        const id = this.idCounter++;
        return new Promise((resolve, reject) => {
            const message = {
                id,
                ...action,
            };
            this.worker.postMessage(message);
            this.actionHandlerMap.messages[id] = resolve;
        });
    }

    exec(actionType, payload) {
        return this.postMessage({actionType, payload});
    }

    on(eventType, handler) {
		this.actionHandlerMap.events[eventType] ??= [];
		this.actionHandlerMap.events[eventType].push(handler);
	}

	off(eventType) {
		delete this.actionHandlerMap.events[eventType];
	}
}
