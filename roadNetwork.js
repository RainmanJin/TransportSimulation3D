class RoadNetwork {
    constructor(data, viewer) {
        //格式：StartC,EndC,StartLane,EndLane,Dir
        this.topology = [
            {
                StartC: 1,
                EndC: 2,
                StartL: 0,
                EndL: 0,
                Dir: 'STRAIGHT',
            },
            {
                StartC: 1,
                EndC: 4,
                StartL: 1,
                EndL: 0,
                Dir: 'STRAIGHT',
            },
            {
                StartC: 2,
                EndC: 3,
                StartL: 0,
                EndL: 0,
                Dir: 'STRAIGHT',
            },
            {
                StartC: 4,
                EndC: 3,
                StartL: 0,
                EndL: 1,
                Dir: 'STRAIGHT',
            }
        ];
        this.roads = [];
        this.vehs = [];//离开行车道孤苦无依的车辆
        this.dataSource = new Cesium.CustomDataSource();
        viewer.dataSources.add(this.dataSource);
        this.networkEntites = this.dataSource.entities;

        data.forEach(row => {
            var road;
            if (row.id == 1) {
                road = new IRoad(row.geom, row.id, row.nlanes, row.width, this.dataSource);
            } else if (row.id == 3) {
                road = new ORoad(row.geom, row.id, row.nlanes, row.width, this.dataSource);
            } else {
                road = new PRoad(row.geom, row.id, row.nlanes, row.width, this.dataSource);
            }
            this.roads.push(road);
        })
        this.distriTopo();
        // this.roads.push(new IRoad(data[0].geom, 1, 1, 3, this.dataSource));
    }
    update(currentTime, dt) {
        //更新u，得到离开行车道的车辆
        this.roads.forEach(road => {
            road.sortVehicles();
            road.updateEnvironment();
            //根据跟驰模型计算加速度，更改速度。会考虑对强制换道的影响
            road.updateSpeedAcc(dt);
            //换道决策，模型参数改变对决策造成影响
            road.decideLC(dt);//dt用于更新换道时间
            //主要负责根据已计算好的参数更新U和V，此外负责触发车辆对车道的选择（Vehicle.optRoad(topology)）
            road.updateUV(dt);
            road.draw(currentTime); //绘制（添加采样点）
            road.updateOut();
            if (road.outVehs) {
                if (road.outVehs[0]) {
                    this.vehs = this.vehs.concat(road.outVehs);
                    road.outVehs = [];
                }
            }
        });
        //转移车辆
        this.vehs.forEach(vehicle => {
            var road = this.getById(vehicle.nextRoad.EndC);
            road.inVehs.push(vehicle);
        })
        this.vehs = [];
        //更新进入车辆
        this.roads.forEach(road => {
            //车辆参数的重置基本在这里完成
            road.updateIn(currentTime, dt);//只有InRoad需要参数
        });
    }
    //由ID得到道路对象
    getById(ID) {
        var road;
        this.roads.some(_road => {
            if (_road.ID == ID) {
                road = _road;
            }
        })
        return road;
    }
    distriTopo() {
        this.topology.forEach(topo => {
            this.getById(topo.StartC).topology.push(topo);
        })
    }
}