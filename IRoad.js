//InRoad，车辆开始进入的行车道
class IRoad extends Road {
    constructor(geom, ID, nlanes, laneWidth, dataSource) {
        super(geom, ID, nlanes, laneWidth, dataSource);
        this.inVehBuffer = 0;//待进入车道的车辆数
        this.type = 'InRoad';
        this.inVehs = undefined;
        this.period = 60;//周期时长，默认60s，方便调整
        this.k_mean = 20;//泊松分布参数那姆达
        this.timeSum = this.period;//累计帧数时间
        this.schedule = [];//1min内时刻表 
    }
    //初始化小车位置朝向等
    initialize(veh, startTime) {
        var dt = 0.1;//用于初始化添一个点
        var positionC0 = this.uv2Cartesian(veh.u, veh.v);
        veh.position.addSample(startTime, positionC0);
        //添加一个0.1s前的采样点
        var positionC1 = this.uv2Cartesian(veh.u - veh.speed * dt, veh.v);
        var dtTime = new Cesium.JulianDate();//减去0.1s后的时间
        veh.position.addSample(Cesium.JulianDate.addSeconds(startTime, -dt, dtTime), positionC1);
        veh.orientation = new Cesium.VelocityOrientationProperty(veh.position);
    }
    //更新入口处车辆,Qin是单位时间车辆数
    updateIn(currentTime, dt) {
        this.timeSum += dt;
        if (this.timeSum > this.period) {
            this.schedule = this.deriveSchedule();//生成时刻表函数
            // console.log(this.schedule);
            this.timeSum -= this.period;
        }
        if (this.timeSum > this.schedule[0]) {
            this.inVehBuffer += 1;
            //  console.log(this.schedule[0]);
            this.schedule.shift();
        }

        var emptyOverfullBuffer = true; //!!

        var smin = 15; // only inflow if largest gap is at least smin 原值15m
        var success = false; // false initially

        if ((emptyOverfullBuffer) && (this.inVehBuffer > 2)) { this.inVehBuffer--; }
        //console.log("road.inVehBuffer=",this.inVehBuffer);


        if (this.inVehBuffer >= 1) {
            // get new vehicle characteristics
            var space = 0; //available bumper-to-bumper space gap
            var lane = this.nLanes - 1; // start with right lane
            var v0 = 20;//预期速度
            var speed = v0;
            if (this.veh.length === 0) { success = true; space = this.roadLen; }

            // if((!success) && setTrucksAlwaysRight && (vehType==="truck"))
            // then success is terminally =false in this step
            // do not need to do any further attempts

            if (!success) {
                var spaceMax = 0;
                for (var candLane = this.nLanes - 1; candLane >= 0; candLane--) {
                    var iLead = this.veh.length - 1;
                    while ((iLead >= 0) && (this.veh[iLead].v != candLane)) {
                        iLead--;
                    }
                    space = (iLead >= 0)
                        ? this.veh[iLead].u - this.veh[iLead].length
                        : this.roadLen + candLane;
                    if (space > spaceMax) {
                        lane = candLane;
                        spaceMax = space;
                    }
                }
                success = (spaceMax >= smin);//spaceMax>=smin?
                if (success) {
                    //空间很窄时降低初始速度
                    speed = Math.min((spaceMax / smin - 1) * v0 + (2 - spaceMax / smin) * (v0 / 2), v0);
                }
            }

            // actually insert new vehicle //IC

            if (success) {
                var uNew = 0;

                var Truck = {
                    length: 10,
                    width: 6,
                }
                var Car = {
                    length: 6,
                    width: 4,
                }

                var vehNew;
                if (Truck) {
                    vehNew = new Vehicle({}, Truck.length, Truck.width, uNew, lane, speed, v0);
                }
                else if (Car) {
                    vehNew = new Vehicle({}, Car.length, Car.width, uNew, lane, speed, v0);
                }




                var vehNew = new Vehicle({}, 7, 2, uNew, lane, speed, v0);
                this.initialize(vehNew, currentTime);
                // this.veh.push(vehNew); // add vehicle after pos nveh-1
                this.networkEntites.add(vehNew);//vehNew只有u,lane等信息，还不能直接绘制；networkEntites是路网实体集合
                this.veh.push(vehNew);
                // console.log('IRoad:vehicle+1');
                this.inVehBuffer -= 1;
            }
        }
    }
    /*以下为发车模型的工具函数*/
    //累加
    static sum_fun(xlist) {
        var n = 0;
        for (i = 0; i < xlist.length; i++) {
            n += xlist[i]
        }
        return n
    }
    //累乘
    static multiply_fun(xlist) {
        var n = 1;
        for (var i = 0; i < xlist.length; i++) {
            n *= xlist[i];
        }
        return n
    }
    //阶乘n！
    static fact_fun(xfact) {
        if (xfact == 0) {
            return 1;
        }
        else {
            var fact_list = new Array();
            var fact_num;
            for (let i = 0; i < xfact; i++) {
                fact_list.push(i + 1);
                fact_num = IRoad.multiply_fun(fact_list);
            }
            return fact_num;
        }
    }
    //算数平均
    static sum_mean_fun(case_list) {
        sum_mean_num = IRoad.sum_fun(case_list) / case_list.length;
        return sum_mean_num;
    }
    //泊松分布
    static poisson_fun(x, case_list = [0], mean_num = 0) {
        var x_fact = IRoad.fact_fun(x);
        var e = 2.7182818;
        var poisson_num;
        if (case_list.length == 1 || case_list[0] == 0) {
            poisson_num = ((e ** (0 - mean_num)) * mean_num ** x) / x_fact;
        }
        else {
            mean_num = IRoad.sum_mean_fun(case_list);
            poisson_num = ((e ** (0 - mean_num)) * mean_num ** x) / x_fact;
        }
        return poisson_num
    }
    //生成[车辆数，泊松概率]数对 
    static probability() {
        var probability_list = [];//二维数组
        var carnum = [];
        var prob = [];
        // var k_mean = 8.95;//泊松分布参数那姆达
        for (let k = 1; k < 21; k++) {
            carnum.push(k);
            prob.push(IRoad.poisson_fun(k, [0], this.k_mean));//k_mean原值8.95
        }
        probability_list[0] = carnum;
        probability_list[1] = prob;
        return probability_list;
    }
    //根据概率表随机1min内车辆数
    static random(arr1, arr2) {//arr1:车辆数，arr2:对应概率
        var sum = 0,
            factor = 0,
            random = Math.random();
        for (var i = arr2.length - 1; i >= 0; i--) {
            sum += arr2[i]; // 统计概率总和
        };
        random *= sum; // 生成概率随机数
        for (var i = arr2.length - 1; i >= 0; i--) {
            factor += arr2[i];
            if (random <= factor)
                return arr1[i];
        };
        return null;
    };

    //生成1min内随机发车时刻表
    deriveSchedule() {
        var prob = IRoad.probability();
        var m = IRoad.random(prob[0], prob[1]);
        var trandom = new Array();
        trandom.push(0);//为了后续循环添加一个0值
        for (var i = 0; i < m; i++) {
            trandom.push(Math.random() * (this.period - trandom[i]) / (m - i) + trandom[i]);
        }
        trandom.shift();
        return trandom;//删除不必要0值
    }
    /*以上为发车模型的工具函数*/
}