import { World, Material, NaiveBroadphase, ContactMaterial, Body, Plane, Vec3, Sphere, PointToPointConstraint, Cylinder, ConvexPolyhedron } from "../lib/cannon-es.0.20.0.min.js";
import { DICE_SHAPE } from "../lib/foundryvtt-dice-so-nice/module/DiceModels.js";
import { Vector3 } from "../../dice-so-nice/libs/three.module.min.js";

const RegisterPromise = {
    TransferableResponse: function(data, transferable) {
        this.data = data;
        this.transferable = transferable;
    }
}

class PhysicsWorkerController {
    constructor() {
        this.worker = self;
        this.actionHandlerMap = {};
        this.worker.onmessage = this.onmessage.bind(this);
        this.shapeList = new Map();
    }

    async onmessage(e) {
        const { id, actionType, payload } = e.data;
        let result;
        if (this.api[actionType]) {
            result = await this.api[actionType].call(this, payload);
        } else {
            result = { msg: "Request not valid" };
        }
        
        if (result instanceof RegisterPromise.TransferableResponse) {
            self.postMessage({ id, response: result.data }, result.transferable);
        } else {
            self.postMessage({ id, response: result });
        }
    }

    get api() {
        return {
            init: this.init,
            addConstraint: this.addConstraint,
            removeConstraint: this.removeConstraint,
            updateConstraint: this.updateConstraint,
            createShape: this.createShape,
            getDiceValue: this.getDiceValue,
            createDice: this.createDice,
            removeDice: this.removeDice,
            addDice: this.addDice,
            playStep: this.playStep,
            simulateThrow: this.simulateThrow,
            getWorldInfo: this.getWorldInfo,
            /*print(payload) {
                console.log(payload.msg);
                return { msg: "msg has been print." };
            },
            async asyncCalc(payload) {
                const result = await new Promise((resolve) => setTimeout(() => resolve(payload.params * 2), 1000));
                return { msg: `the caculated answer is ${result}.` };
            }*/
        }
    }

    /**
     * Initialize the physics simulation
     */
    init(data) {
        this.world = new World();
        this.dice_body_material = new Material();
        this.desk_body_material = new Material();
        this.barrier_body_material = new Material();

        this.soundDelay = 2; // time between sound effects in worldstep
        this.animstate = 'throw';

        this.mouseConstraint = null;

        this.diceList = new Map();

        this.world.gravity.set(0, 0, -9.8 * 800);
        this.world.broadphase = new NaiveBroadphase();
        this.world.solver.iterations = 14;
        this.world.allowSleep = true;

        this.muteSoundSecretRolls = data.muteSoundSecretRolls;

        this.addContactMaterials();
        this.addDesk();
        this.addBarriers(data.height, data.width);
        this.addJointBody();
        this.reset();
    }

    /**
     * Adds contact materials between different body materials with the specified
     * friction and restitution options.
     */
    addContactMaterials() {
        const contactMaterials = [
            { materials: [this.desk_body_material, this.dice_body_material], options: { friction: 0.01, restitution: 0.5 } },
            { materials: [this.barrier_body_material, this.dice_body_material], options: { friction: 0, restitution: 0.95 } },
            { materials: [this.dice_body_material, this.dice_body_material], options: { friction: 0.01, restitution: 0.7 } }
        ];

        for (const { materials, options } of contactMaterials) {
            const contactMaterial = new ContactMaterial(...materials, options);
            this.world.addContactMaterial(contactMaterial);
        }
    }

    /**
     * Adds a static desk body to the world simulation with the desk_body_material.
     */
    addDesk() {
        const desk = new Body({ allowSleep: false, mass: 0, shape: new Plane(), material: this.desk_body_material });
        this.world.addBody(desk);
    }

    /**
     * Adds barriers around the world simulation to keep dice within bounds.
     */
    addBarriers(height, width) {
        const barriersConfig = [
            { axis: new Vec3(1, 0, 0), angle: Math.PI / 2, position: new Vec3(0, height * 0.93, 0) },
            { axis: new Vec3(1, 0, 0), angle: -Math.PI / 2, position: new Vec3(0, -height * 0.93, 0) },
            { axis: new Vec3(0, 1, 0), angle: -Math.PI / 2, position: new Vec3(width * 0.93, 0, 0) },
            { axis: new Vec3(0, 1, 0), angle: Math.PI / 2, position: new Vec3(-width * 0.93, 0, 0) }
        ];

        for (const { axis, angle, position } of barriersConfig) {
            const barrier = new Body({ allowSleep: false, mass: 0, shape: new Plane(), material: this.barrier_body_material });
            barrier.quaternion.setFromAxisAngle(axis, angle);
            barrier.position.copy(position);
            this.world.addBody(barrier);
        }
    }

    /**
     * Adds a joint body to the world simulation, which can be used to interact
     * with the dice.
     */
    addJointBody() {
        const shape = new Sphere(0.1);
        this.jointBody = new Body({ mass: 0 });
        this.jointBody.addShape(shape);
        this.jointBody.collisionFilterGroup = 0;
        this.jointBody.collisionFilterMask = 0;
        this.world.addBody(this.jointBody);
    }

    /**
     * Adds a dice to the world simulation with the dice_body_material.
     */
    createDice({id, shape, material, vectordata, mass, startAtIteration, options}) {
        const body = new Body({ allowSleep: true, sleepSpeedLimit: 75, sleepTimeLimit: 0.9, mass: mass, shape: this.shapeList.get(shape), material: this.dice_body_material });
        body.type = Body.DYNAMIC;
        body.position.set(vectordata.pos.x, vectordata.pos.y, vectordata.pos.z);
        body.quaternion.setFromAxisAngle(new Vec3(vectordata.axis.x, vectordata.axis.y, vectordata.axis.z), vectordata.axis.a * Math.PI * 2);
        body.angularVelocity.set(vectordata.angle.x, vectordata.angle.y, vectordata.angle.z);
        body.velocity.set(vectordata.velocity.x, vectordata.velocity.y, vectordata.velocity.z);
        body.linearDamping = 0.1;
        body.angularDamping = 0.1;
        body.addEventListener('collide', this.eventCollide.bind(this));
        body.stepQuaternions = new Float32Array(1001 * 4);
        body.stepPositions = new Float32Array(1001 * 3);

        //We add some informations about the dice to the CANNON body to be used in the collide event
        body.diceType = vectordata.type;
        body.diceShape = shape;
        body.diceMaterial = material;
        body.secretRoll = options?.secret ?? false;
        body.startAtIteration = startAtIteration;

        this.diceList.set(id, body);
    }

    addDice(id) {
        const dice = this.diceList.get(id);
        this.world.addBody(dice);
    }

    removeDice(ids) {
        for (const id of ids) {
            const dice = this.diceList.get(id);
            this.world.removeBody(dice);

            this.diceList.delete(id);
        }
    }

    cleanAfterThrow() {
        //Reset positions and quaternions of all the dice
        for(const [id, body] of this.diceList) {
            //We need to create new arrays for the stepQuaternions and stepPositions because they were transfered to the main thread
            body.stepPositions = new Float32Array(1001 * 3);
            body.stepQuaternions = new Float32Array(1001 * 4);
            this.diceList.set(id, body);
        }
    }

    /**
     * Collide event handler for dice bodies.
     */
    eventCollide({ body, target }) {
        if (!body) return;

        const now = body.world.stepnumber;
        const currentSoundType = body.mass > 0 ? 'dice' : 'table';

        if (this.shouldSkipSound(now, currentSoundType)) return;

        if (body.mass > 0) { // dice to dice collision
            this.handleDiceCollision(body, target);
        } else { // dice to table collision
            this.handleTableCollision(body, target);
        }

        this.updateLastSound(now);
    }

    /**
     * Determines if the sound should be skipped based on the current world step and sound type.
     * @param {number} now - The current world step number.
     * @param {string} currentSoundType - The type of sound ('dice' or 'table').
     * @returns {boolean} - True if the sound should be skipped, false otherwise.
     */
    shouldSkipSound(now, currentSoundType) {
        const soundPlayedThisStep = this.lastSoundStep === now;
        const notEnoughDelay = this.lastSound > now;

        if (soundPlayedThisStep || notEnoughDelay) {
            const sameSoundType = currentSoundType === 'dice' && this.lastSoundType === 'dice';
            return !(currentSoundType !== 'dice') || sameSoundType;
        }
        return false;
    }

    /**
     * Handles dice to dice collision and plays appropriate sound.
     * @param {Object} body - The body involved in the collision.
     * @param {Object} target - The target involved in the collision.
     */
    handleDiceCollision(body, target) {
        const speed = body.velocity.length();
        if (speed < 250) return; // Don't play at low speeds

        const strength = this.calculateStrength(speed, 550, 0.2);
        const shouldMute = this.muteSoundSecretRolls && (body.secretRoll || target.secretRoll);
        const finalStrength = shouldMute ? 0 : strength;

        if (this.animstate === "simulate") {
            this.detectedCollides[this.iteration] = ["dice", body.diceType, body.diceMaterial, finalStrength];
        } else {
            this.host.emit("collide", { source: "dice", type: body.diceType, material: body.diceMaterial, strength: finalStrength });
        }
        this.lastSoundType = 'dice';
    }

    /**
     * Handles dice to table collision and plays appropriate sound.
     * @param {Object} body - The body involved in the collision.
     * @param {Object} target - The target involved in the collision.
     */
    handleTableCollision(body, target) {
        const speed = target.velocity.length();
        if (speed < 100) return; // Don't play at low speeds

        const strength = this.calculateStrength(speed, 500, 0.2);
        const shouldMute = this.muteSoundSecretRolls && (body.secretRoll || target.secretRoll);
        const finalStrength = shouldMute ? 0 : strength;

        if (this.animstate === "simulate") {
            this.detectedCollides[this.iteration] = ["table", null, null, finalStrength];
        } else {
            this.host.emit("collide", { source: "table", type: null, material: null, strength: finalStrength });
        }

        this.lastSoundType = 'table';
    }

    /**
     * Calculates the strength of the sound based on the speed, max speed, and minimum strength.
     * @param {number} speed - The speed of the object involved in the collision.
     * @param {number} maxSpeed - The maximum speed for calculating strength.
     * @param {number} minStrength - The minimum strength value.
     * @returns {number} - The calculated strength value.
     */
    calculateStrength(speed, maxSpeed, minStrength) {
        return Math.max(Math.min(speed / maxSpeed, 1), minStrength);
    }

    /**
     * Updates the last sound step and last sound properties based on the current world step.
     * @param {number} now - The current world step number.
     */
    updateLastSound(now) {
        this.lastSoundStep = now;
        this.lastSound = now + this.soundDelay;
    }

    addConstraint({id, pos}){
        const dice = this.diceList.get(id);
        let v1 = new Vec3(pos.x, pos.y, pos.z).vsub(dice.position);

        // Apply anti-quaternion to vector to tranform it into the local body coordinate system
        let antiRot = dice.quaternion.inverse();
        let pivot = antiRot.vmult(v1); // pivot is not in local body coordinates

        // Move the cannon click marker particle to the click position
        this.jointBody.position.set(pos.x, pos.y, pos.z + 150);

        // Create a new constraint
        // The pivot for the jointBody is zero
        this.mouseConstraint = new PointToPointConstraint(dice, pivot, this.jointBody, new Vec3(0, 0, 0));

        // Add the constriant to world
        this.world.addConstraint(this.mouseConstraint);
    }

    updateConstraint(pos){
        if (this.mouseConstraint) {
            this.jointBody.position.set(pos.x, pos.y, pos.z + 150);
            this.mouseConstraint.update();
        }
    }

    removeConstraint(){
        if (this.mouseConstraint) {
            this.world.removeConstraint(this.mouseConstraint);
            this.mouseConstraint = null;
        }
    }

    createShape({type, radius}){
        const data = DICE_SHAPE[type];
        switch(data.type){
            case "ConvexPolyhedron":
                this.shapeList.set(type, this.loadGeom(data.vertices, data.faces, radius, data.skipLastFaceIndex));
                break;
            case "Cylinder":
                this.shapeList.set(type, new Cylinder(radius*data.radiusTop, radius*data.radiusBottom, radius*data.height, data.numSegments));
                break;
            default:
                throw new Error("Unknown shape type: " + data.type);
        }
    }

    loadShape(vertices, faces, radius, skipLastFaceIndex = false) {
        const cv = new Array(vertices.length);
        const cf = new Array(faces.length);
    
        for (let i = 0; i < vertices.length; ++i) {
            const v = vertices[i];
            cv[i] = new Vec3(v.x * radius, v.y * radius, v.z * radius);
        }
    
        for (let i = 0; i < faces.length; ++i) {
            cf[i] = skipLastFaceIndex ? faces[i].slice(0, faces[i].length - 1) : faces[i];
        }
        return new ConvexPolyhedron({ vertices: cv, faces: cf });
    }
    
    loadGeom(vertices, faces, radius, skipLastFaceIndex = false) {
        const vectors = new Array(vertices.length);
    
        for (let i = 0; i < vertices.length; ++i) {
            vectors[i] = (new Vector3).fromArray(vertices[i]).normalize();
        }
    
        return this.loadShape(vectors, faces, radius, skipLastFaceIndex);
    }

    getDiceValue(id){
        const dice = this.diceList.get(id);

        if(!dice)
            return null;
        if(dice.result)
            return dice.result;

        const vector = new Vector3(0, 0, dice.diceShape == 'd4' ? -1 : 1);
        const faceCannon = new Vector3();
        let closest_face, closest_angle = Math.PI * 2;
        for (let i = 0, l = dice.shapes[0].faceNormals.length; i < l; ++i) {
            if(DICE_SHAPE[dice.diceShape].faceValues[i] == 0)
                continue;
            faceCannon.copy(dice.shapes[0].faceNormals[i]);
            
            const angle = faceCannon.applyQuaternion(dice.quaternion).angleTo(vector);
            if (angle < closest_angle) {
                closest_angle = angle;
                closest_face = i;
            }
        }
        const dieValue = DICE_SHAPE[dice.diceShape].faceValues[closest_face];
        dice.result = dieValue;
        this.diceList.set(id, dice);

        return dieValue;
    }

    reset(){
        this.lastSoundType = '';
        this.lastSoundStep = 0;
        this.lastSound = 0;
        this.detectedCollides = new Array(1000);
        this.iterationsNeeded = 0;
        this.animstate = 'simulate';
        this.iteration = 0;
    }

    simulateThrow({minIterations, nbIterationsBetweenRolls, framerate, canBeFlipped}) {
        this.reset();

        this.minIterations = minIterations;
        this.nbIterationsBetweenRolls = nbIterationsBetweenRolls;
        this.framerate = framerate;
        this.canBeFlipped = canBeFlipped;

        this.runPhysicsSimulation();

        //return the quaternions and positions of every die at each step
        const ids = [];
        const quaternions = [];
        const positions = [];
        const deads = [];

        for (const [id, dice] of this.diceList) {
            ids.push(id);
            quaternions.push(dice.stepQuaternions);
            positions.push(dice.stepPositions);
            deads.push(dice.dead ?? false);
        }

        // Get the buffers from the typed arrays
        const quaternionsBuffers = quaternions.map(quat => quat.buffer);
        const positionsBuffers = positions.map(pos => pos.buffer);

        this.animstate = 'throw';

        this.cleanAfterThrow();

        return new RegisterPromise.TransferableResponse({
            ids: ids, 
            quaternionsBuffers: quaternionsBuffers, 
            positionsBuffers: positionsBuffers, 
            detectedCollides: this.detectedCollides, 
            deads: deads,
            iterationsNeeded: this.iterationsNeeded
        }, [...quaternionsBuffers, ...positionsBuffers]);
    }
    
    runPhysicsSimulation() {
        while (!this.throwFinished()) {
            //Before each step, we copy the quaternions of every die in an array
            ++this.iteration;
    
            if (!(this.iteration % this.nbIterationsBetweenRolls)) {
                for(const [id, dice] of this.diceList){
                    if(dice.startAtIteration == this.iteration){
                        this.world.addBody(dice);
                    }
                }
            }
            this.world.step(this.framerate);
    
            for (let i = 0; i < this.world.bodies.length; i++) {
                if (this.world.bodies[i].stepPositions) {
                    this.world.bodies[i].stepQuaternions.set([this.world.bodies[i].quaternion.x, this.world.bodies[i].quaternion.y, this.world.bodies[i].quaternion.z,this.world.bodies[i].quaternion.w], this.iteration*4);
                    this.world.bodies[i].stepPositions.set([this.world.bodies[i].position.x, this.world.bodies[i].position.y, this.world.bodies[i].position.z], this.iteration*3);
                }
            }
        }
    }
    
    throwFinished() {
        let stopped = true;
        if (this.iteration <= this.minIterations) return false;

        for(const [id, dice] of this.diceList){
            if (dice.sleepState < 2) {
                stopped = false;
                break;
            } else {
                dice.asleepAtIteration = this.iteration;
            }
        }

        if (this.iteration >= 1000)
            stopped = true;
        //Throw is actually finished
        if (stopped) {
            this.iterationsNeeded = this.iteration;
            for(const [id, dice] of this.diceList){
                dice.result = this.getDiceValue(id);
                if(!this.canBeFlipped){
                    //make the current dice on the board STATIC object so they can't be knocked
                    dice.mass = 0;
                    dice.dead = dice.asleepAtIteration || false;
                    dice.updateMassProperties();
                }
                this.diceList.set(id, dice);
            }
        }
        return stopped;
    }

    playStep({time_diff}) {
        if(this.animstate == 'simulate')
            return;
        //console.log('playStep', time_diff);
        const ids = [];
        const quaternions = new Float32Array(this.diceList.size * 4);
        const positions = new Float32Array(this.diceList.size * 3);
        let worldAsleep = true;
        for (let i = 0; i < this.world.bodies.length; i++) {
            if (this.world.bodies[i].allowSleep && this.world.bodies[i].sleepState < 2) {
                worldAsleep = false;
                break;
            }
        }
        if (!worldAsleep) {
            this.world.step(this.framerate, time_diff);
            for(const [id, dice] of this.diceList){
                if(!dice.dead){
                    ids.push(id);
                    quaternions.set([dice.quaternion.x, dice.quaternion.y, dice.quaternion.z,dice.quaternion.w], ids.length*4-4);
                    positions.set([dice.position.x, dice.position.y, dice.position.z], ids.length*3-3);
                }
            }
        }
        return new RegisterPromise.TransferableResponse({ids: ids, quaternionsBuffers: quaternions.buffer, positionsBuffers: positions.buffer, worldAsleep: worldAsleep}, [quaternions.buffer, positions.buffer]);
    }

    //debug function to get the state of the CANNON world
    getWorldInfo() {
        console.log(`World iteration: ${this.world.stepnumber}`);

        console.log(`World has ${this.world.bodies.length} bodies:`);
        for (let i = 0; i < this.world.bodies.length; i++) {
            console.log(`body ${i}:`);
            console.log(this.world.bodies[i]);
        }

        console.log(`World has ${this.world.constraints.length} constraints:`);
        for (let i = 0; i < this.world.constraints.length; i++) {
            console.log(`constraint ${i}:`);
            console.log(this.world.constraints[i]);
        }
    }

}
self.physicsWorkerController = new PhysicsWorkerController();