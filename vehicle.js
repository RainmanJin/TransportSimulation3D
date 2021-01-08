class Vehicle extends Cesium.Entity {
    constructor(options, length, width, u, lane, speed, v0, LongModel, LCModel) {
        super(options);
        this.model = (Math.floor(Math.random() * 2)) == 0 ? new Cesium.ModelGraphics({
            uri: "./models/vehicles/GroundVehicle.glb",
            scale: 1,
        }) : new Cesium.ModelGraphics({
            uri: "./models/vehicles/MilkTruck.glb",
            scale: 1,
        });
        this.length = length;
        this.width = width;
        this.u = u;
        this.v = lane;//所在车道。!!从0起算
        this._targetLane = this.v;//将要变入的车道，普通换道或上下游交接时使用
        this.v0 = v0;//预期速度
        this.speed = speed;
        this.topoChanged = false;//用于判断是否已经更新过路线
        this.description = "<div>" + this.v + "</div>";
        //跟驰模型
        this.acc = 0;//当前加速度
        this.LongModel = new ACC(this.v0);
        //换道模型
        this.LCModel = new MOBIL();
        this.left = true; this.right = true;//是否可以向左或向右换道
        this.LCTimeInit = 2; this.LCTime = this.LCTimeInit * Math.random();//用换道时间限制频繁换道
        this.lowSpeed = 2;//调低预期速度
        this.normalSpeed = this.v0;//调回正常速度
        this.vSpeed = 0;//横向换道的速度，车道/s
        //周围车辆
        this.initEnvironment();
        //position相关设置
        this.position = new Cesium.SampledPositionProperty();
        this.position.forwardExtrapolationDuration = 1;
        this.position.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
        this.position.backwardExtrapolationDuration = 1;
        this.position.backwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
        //debug
        this.label = {
            show: true,
            showBackground: true,
            font: "14px monospace",
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(5, 5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
    }
    get targetLane() {
        return Number(this._targetLane);
    }
    set targetLane(lane) {
        this._targetLane = Number(lane);
    }
    optRoad(topology) {
        this.nextRoad = topology[Math.floor(Math.random() * topology.length)];
    }
    initEnvironment() {
        this.lead = undefined; this.lag = undefined; this.leadLeft = undefined;
        this.leadRight = undefined; this.lagLeft = undefined; this.lagRight = undefined;
    }
    //换道决策模型，控制换道时间限制
    decideLC(dt, roadLen) {
        //！管理强制换道
        this.LCDir();

        this.LCTime -= dt;
        // this.label.text = 'v:' + Number(this.v).toFixed(2) +
        //     '\vSpeed:' + this.vSpeed +
        //     '\ntarget:' + this.targetLane;

        if (this.LCTime < 0) {
            //先左后右，因为左边车道速度更快
            if (this.left) {
                if (this.calcLC(this.leadLeft, this.lagLeft, roadLen)) {
                    this.targetLane = Number(this.v - 1).toFixed(0);
                    this.LCTime += this.LCTimeInit;
                    return;
                }
            }
            if (this.right) {
                if (this.calcLC(this.leadRight, this.lagRight, roadLen)) {
                    this.targetLane = Number(this.v + 1).toFixed(0);
                    this.LCTime += this.LCTimeInit;
                    return;
                }
            }
        }
    }
    //限制车辆左右换道，控制强制换道模型的启用与关闭
    LCDir() {
        if (!this.topoChanged) { return; }
        if (this.targetLane != this.nextRoad.StartL) {
            this.LCModel.setMandatory();
            if (this.targetLane > this.nextRoad.StartL) { this.right = false; }
            else { this.left = false; }
        } else {
            this.left = false; this.right = false;
            this.LCModel.reset();
        }
    }
    //管理换道过程中的计算，lead和lag是换道后新车道上前后车
    calcLC(vehLead, vehLag, roadLen) {
        var sNew, accNew;//sNew是与前车距离
        if (vehLead) {//如果前车存在
            if (vehLead.LCTime > 0) { return false; }//判断前车是否刚刚换道
            sNew = vehLead.u - vehLead.length - this.u;
            accNew = this.LongModel.calcAcc(sNew, this.speed, vehLead.speed, vehLead.acc);
        } else {
            sNew = roadLen - this.u + this.LongModel.s0;
            accNew = this.LongModel.calcAcc(sNew, this.speed, this.v0 / 2, this.acc / 2);
        }
        var sLagNew, accLag, accLagNew;
        if (vehLag) {
            if (vehLag.LCTime > 0) { return false; }
            sLagNew = this.u - this.length - vehLag.u;
            accLag = vehLag.acc;
            accLagNew = this.LongModel.calcAcc(sLagNew, vehLag.speed, this.speed, this.acc);
        } else {
            sLagNew = 1000;
            accLag = 0;
            accLagNew = 0;
        }
        var success = this.LCModel.estimateLC(this.speed / this.v0, this.acc, accNew, accLag, accLagNew);
        if (sNew > 0 && sLagNew > 0 && success) {
            return true;
        }
    }
    //换道实现模型
    realizeLC(dt) {
        var gap = this.v - this.targetLane;
        //横向移动加速度，使换道过程更平滑(车道/s^2)
        var vacc = 2;
        if (Math.abs(gap) > 0) {
            //移动方向，正向右，负向左
            var dir = gap > 0 ? -1 : 1;
            //确定加速度符号，换道未办加速，过半减速
            var accSign = Math.abs(gap) > 0.5 ? 1 : -1;
            //横向移动速度，车道/s
            this.vSpeed = Math.max(0, this.vSpeed + accSign * vacc * dt);
            //实际换道
            // this.v = this.v + dir * (this.vSpeed * dt + accSign * vacc * dt * dt / 2);
            this.v = this.v + dir * this.vSpeed * dt;
            if (Math.abs(this.v - this.targetLane) < this.vSpeed * dt) {
                this.v = this.targetLane;
                this.vSpeed = 0;
            }
        } else {
            this.v = this.targetLane;
            this.vSpeed = 0;
        }
    }
    // // 根据目标车道上前后车情况调整预期速度
    // // 以此加速减速，配合实现强制换道
    // modifyLongModel() {
    //     if (!this.topoChanged) { return; }
    //     var changeFlag = false;
    //     if (this.targetLane < this.nextRoad.StartL) {
    //         //分别考虑前后车的影响
    //         if (this.leadRight) {
    //             //如果前车车身挡住换道则减速
    //             if (this.leadRight.u - this.leadRight.length - this.u < 0) {
    //                 this.LongModel.v0 /= 2;
    //                 changeFlag = true;
    //             }
    //         }
    //         if (this.lagRight) {
    //             //如果后车车身挡住
    //             if (this.lagRight.u - this.lagRight.length - this.u) {
    //                 this.LongModel.v0 /= 2;
    //                 changeFlag = true;
    //             }
    //         }
    //     } else if (this.targetLane < this.nextRoad.StartL) {

    //     }
    // }
}