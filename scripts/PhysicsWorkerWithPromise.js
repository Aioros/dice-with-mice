export class PhysicsWorkerWithPromise {
    constructor(options) {
        this.idCounter = 0;
        this.worker = new Worker(options.workerUrl, { name: options.workerName, type: "module" });
        this.actionHandlerMap = {};
        this.worker.onmessage = this.onmessage.bind(this);
    }
    onmessage(e) {
        const { id, response } = e.data;
        if (!this.actionHandlerMap[id]) return;
        this.actionHandlerMap[id].call(this, response);
        delete this.actionHandlerMap[id];
    }
    postMessage(action) {
        const id = this.idCounter++;
        return new Promise((resolve, reject) => {
            const message = {
                id,
                ...action,
            };
            this.worker.postMessage(message);
            this.actionHandlerMap[id] = (response) => {
                resolve(response);
            };
        });
    }

    exec(actionType, payload) {
        const id = this.idCounter++;
        return new Promise((resolve, reject) => {
            const message = {
                id,
                actionType,
                payload
            };
            this.worker.postMessage(message);
            this.actionHandlerMap[id] = (response) => {
                resolve(response);
            };
        });
    }
}
