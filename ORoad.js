//OutRoad，车辆最后出去的行车道
class ORoad extends Road {
  constructor(geom, ID, nlanes, laneWidth, dataSource) {
    super(geom, ID, nlanes, laneWidth, dataSource);
    this.type = 'OutRoad';
    this.outVehs = undefined;
  }
  //ORoad不用选择下游车道，重写updateU
  updateUV(dt) {
    this.veh.forEach(vehicle => {
      //平滑换道
      vehicle.realizeLC(dt);
      //没有考虑横向移动对速度的影响
      //u最小值略大于0，避免车辆朝向乱转
      vehicle.u += Math.max(vehicle.speed * dt + vehicle.acc * dt * dt / 2, 0.00001 / 60);
    });
  }
  updateOut() {
    if (this.veh.length > 0) {
      if (this.veh[0].u > this.roadLen) {
        // console.log(this.veh[0].v);
        this.networkEntites.remove(this.veh[0]);
        this.veh.shift();
      }
    }
  }
}