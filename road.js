var height = 60;//临时变量
//所有行车道的基类，根据PRoad设计，也就是说PRoad基本不需要做改动
//这里road不包括路网，只是简单一条直道
//dataSource是roadNetwork的this.dataSource，路网上所有车辆都在该dataSource内，避免闪烁
class Road {//owner是viewer;
  constructor(geom, ID, nlanes, laneWidth, dataSource) {
    this.geom = geom;
    this.initUArray(this.geom);
    this.networkEntites = dataSource.entities;//整个路网的实体集合，真正添加和删除实体
    this.veh = [];//车辆数组，仅管理本行车道
    this.ID = ID;
    this.nLanes = nlanes;
    this.laneWidth = laneWidth;
    this.roadLen = this.uarray.slice(-1)[0];//对的路加长度属性
    this.topology = [];//拓扑关系
    this.inVehs = [];//元素为进入该行车道的Vehicle
    this.outVehs = [];//离开该行车道的Vehicle
  }
  //输入GeoJSON格式的geom，自动生成uarray
  initUArray(geom) {
    this.uarray = [0];
    geom = geom.coordinates;
    for (var i = 0; i < geom.length - 1; i++) {
      this.uarray.push(Road.getFlatternDistance(geom[i][0], geom[i][1], geom[i + 1][0], geom[i + 1][1]));
    }
  }
  /*
  *二分查找最近点索引
  *@param {Object} arr 待查找序列
  *@param {Number} obj 要查找的值
  *return {Number} 最近点索引（从左至右）
  */
  static binarySearch(arr, obj) {
    if (obj <= 0) return 0;
    if (obj >= arr[arr.length - 1]) return arr.length - 2;
    var left = 0;
    var right = arr.length;
    while (left <= right) {
      var center = Math.floor((left + right) / 2);
      if (obj < arr[center]) {
        right = center - 1;
      } else {
        left = center + 1;
      }
    }
    return right;
  }

  //按u大小对车辆排序
  sortVehicles() {
    if (this.veh.length > 1) {
      this.veh.sort(function (a, b) {
        return b.u - a.u;
      })
    };
  }

  //由两点实际坐标和比例返回新坐标（经纬度高程），方向由1指向2
  static calcuLngLatH(lnglatHeight1, lnglatheight2, segScale) {
    var lnglatHeight = [];
    var dtLng = lnglatheight2[0] - lnglatHeight1[0];
    var dtLat = lnglatheight2[1] - lnglatHeight1[1];
    var dtHeight = lnglatheight2[2] - lnglatHeight1[2];
    lnglatHeight.push(lnglatHeight1[0] + segScale * dtLng);
    lnglatHeight.push(lnglatHeight1[1] + segScale * dtLat);
    lnglatHeight.push(lnglatHeight1[2] + segScale * dtHeight);
    return lnglatHeight;
  }
  /*
  *计算任意道路长度坐标的经纬度
  *@param {Object} roadCLCoordArr 道路中心线节点经纬度坐标数组
  *@param {Object} uArr 道路中心线节点长度坐标数组
  *@param {Number} u 道路中心线任意一点长度坐标
  *return {Object} 经纬度高度坐标数组
  */
  static getDynamicGeoCoord(roadCLCoordArr, uArr, u) {
    if (roadCLCoordArr instanceof Array) {
      if (u <= 0) {
        // console.log("<0!");
        var segDist = uArr[1] - uArr[0];
        var segScale = u / segDist;
        return Road.calcuLngLatH(roadCLCoordArr[0], roadCLCoordArr[1], segScale);
      }
      if (u >= uArr[uArr.length - 1]) {
        // console.log(">length!");
        var segDist = uArr[uArr.length - 1] - uArr[uArr.length - 2];
        var segScale = (u - uArr[uArr.length - 2]) / segDist;
        return Road.calcuLngLatH(roadCLCoordArr[roadCLCoordArr.length - 2], roadCLCoordArr[roadCLCoordArr.length - 1], segScale);
      }
      var nearestIndex = Road.binarySearch(uArr, u);
      var dist = u - uArr[nearestIndex];
      var segDist = uArr[nearestIndex + 1] - uArr[nearestIndex];
      var segScale = dist / segDist;
      if (!roadCLCoordArr[nearestIndex + 1]) {
        debugger;
      }
      return Road.calcuLngLatH(roadCLCoordArr[nearestIndex], roadCLCoordArr[nearestIndex + 1], segScale);
    }
  }
  u2geom(u) {
    return Road.getDynamicGeoCoord(this.geom.coordinates, this.uarray, u);
  }

  //再封装一次直接由u和v（车道序号lane）得到笛卡尔坐标
  uv2Cartesian(u, v) {
    var du = 0.3;
    var lnglatheight0 = this.u2geom(u);
    // var XYZ=Cesium.Cartesian3.fromDegrees(lnglatheight0[0],lnglatheight0[1],lnglatheight0[2]);//正确写法
    var XYZ = Cesium.Cartesian3.fromDegrees(lnglatheight0[0], lnglatheight0[1], height);//临时写法
    var lnglatheight1 = this.u2geom(u + du);
    var lnglatheight2 = this.u2geom(u - du);
    //将经纬度转化为笛卡尔坐标系下的坐标
    var XYZ_A = Cesium.Cartesian3.fromDegrees(lnglatheight1[0], lnglatheight1[1], lnglatheight1[2]);
    var XYZ_B = Cesium.Cartesian3.fromDegrees(lnglatheight2[0], lnglatheight2[1], lnglatheight2[2]);
    //得到从局部坐标变换到世界坐标的四阶矩阵
    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(XYZ);
    //取任意一点坐标两端相近两点的坐标，作为计算向量的两个端点
    var direction = Cesium.Cartesian3.subtract(XYZ_A, XYZ_B, new Cesium.Cartesian3());
    //取局部坐标（0，0，1）
    var vectorUp = new Cesium.Cartesian3(0.0, 0.0, 1.0);
    //向上的向量从局部坐标转为世界坐标
    Cesium.Matrix4.multiplyByPointAsVector(transform, vectorUp, vectorUp);
    var verticalVector = new Cesium.Cartesian3();
    //叉乘得到垂直于道路方向的向量，方向指向positionvector的右侧
    Cesium.Cartesian3.cross(direction, vectorUp, verticalVector);
    //得到单位向量
    Cesium.Cartesian3.normalize(verticalVector, verticalVector);
    //得到道路的平移量
    Cesium.Cartesian3.multiplyByScalar(verticalVector, this.laneWidth * v, verticalVector);
    Cesium.Cartesian3.add(XYZ, verticalVector, XYZ);
    // else{console.log("v=0")}
    if (!XYZ) { console.log("uv2Cartesian: u out of range!"); return; }
    return XYZ;
  }
  //更新速度和加速度，兼顾强制换道
  updateSpeedAcc(dt) {
    this.veh.forEach(veh => {
      veh.speed = Math.max(veh.speed + veh.acc * dt, 0);
      //判断是否需要强制换道
      var limitAcc = 100;//夸张设值
      if (veh.topoChanged && (veh.targetLane != veh.nextRoad.StartL)) {
        //强制在无法换道前停下，LimitDistance的定义在models.js
        limitAcc = veh.LongModel.calcAcc(this.roadLen - veh.u - LimitDistance, veh.speed, 0, 0);

      }
      //有前方车辆则正常计算跟驰加速度，没有则假设前车为道路尽头不远处的障碍
      var longAcc = veh.lead ? veh.LongModel.calcAcc(veh.lead.u - veh.lead.length - veh.u, veh.speed, veh.lead.speed, veh.lead.acc) :
        veh.LongModel.calcAcc(this.roadLen - veh.u + veh.LongModel.s0, veh.speed, veh.v0 / 2, veh.acc / 2);
      veh.acc = Math.min(limitAcc, longAcc);
    })
  }
  //更新所有车辆的u和v
  updateUV(dt) {
    this.veh.forEach(vehicle => {
      //平滑换道
      vehicle.realizeLC(dt);
      //没有考虑横向移动对速度的影响
      //u最小值略大于0，避免车辆朝向乱转
      vehicle.u += Math.max(vehicle.speed * dt + vehicle.acc * dt * dt / 2, 0.00001 / 60);
      //快到出口时选择下游车道
      if (vehicle.u - this.roadLen > -vehicle.v0 * 5) {
        if (!vehicle.topoChanged) {
          vehicle.optRoad(this.topology); vehicle.topoChanged = true;
        }
      }
    });
  }
  //更新入口处车辆，对车辆参数重置
  updateIn() {
    this.inVehs.forEach((vehicle) => {
      // console.log('road' + this.ID + '+vehicle');
      vehicle.topoChanged = false;
      vehicle.nextRoad = undefined;
      vehicle.left = true;
      vehicle.right = true;
      vehicle.LongModel.reset(vehicle.normalSpeed);
      vehicle.LCModel.reset();
      this.veh.push(vehicle);
    })
    this.inVehs = [];
  }
  //更新离开行车道的车辆
  updateOut() {
    if (this.veh.length > 0) {
      if (this.veh[0].u > this.roadLen) {
        this.veh[0].u -= this.roadLen;
        this.veh[0].v = this.veh[0].nextRoad.EndL;
        this.veh[0].targetLane = this.veh[0].nextRoad.EndL;
        this.outVehs.push(this.veh[0]);
        this.veh.shift();//删除第一个元素
      }
    }
  }

  //addSample，经过这一步才会在Cesium窗口绘制
  draw(currentTime) {
    var p;
    this.veh.forEach(vehicle => {
      p = this.uv2Cartesian(vehicle.u, vehicle.v);
      if (p) {
        vehicle.position.addSample(currentTime, p);
        //删除过时位置坐标
        var startTime = new Cesium.JulianDate();
        var endTime = new Cesium.JulianDate();
        Cesium.JulianDate.addSeconds(currentTime, - 0.1, startTime);
        Cesium.JulianDate.addSeconds(currentTime, -1, endTime);
        vehicle.position.removeSamples(new Cesium.TimeInterval({
          start: startTime,
          stop: endTime,
        }));
      }
    });
  }
  //更新车辆周围环境
  updateEnvironment() {
    this.veh.forEach((veh, i) => {
      this.updateVehEnvi(i);
    })
  }
  //更新索引为i车辆的环境
  updateVehEnvi(index) {
    this.veh[index].initEnvironment();
    var lead, leadLeft, leadRight;//bool值，判断是否找到对应附近车辆
    lead = false; leadLeft = false; leadRight = false;
    for (let i = index - 1; i >= 0; i--) {
      if ((this.veh[i].targetLane == this.veh[index].targetLane) && !lead) {
        this.veh[index].lead = this.veh[i];
        lead = true;
      }
      if ((this.veh[i].targetLane == this.veh[index].targetLane - 1) && !leadLeft) {
        this.veh[index].leadLeft = this.veh[i];
        leadLeft = true;
      }
      if ((this.veh[i].targetLane == this.veh[index].targetLane + 1) && !leadRight) {
        this.veh[index].leadRight = this.veh[i];
        leadRight = true;
      }
    }
    var lag, lagLeft, lagRight;//bool值，判断是否找到对应附近车辆
    lag = false; lagLeft = false; lagRight = false;
    for (let i = index + 1; i < this.veh.length; i++) {
      if ((this.veh[i].targetLane == this.veh[index].targetLane) && !lag) {
        this.veh[index].lag = this.veh[i];
        lag = true;
      }
      if ((this.veh[i].targetLane == this.veh[index].targetLane - 1) && !lagLeft) {
        this.veh[index].lagLeft = this.veh[i];
        lagLeft = true;
      }
      if ((this.veh[i].targetLane == this.veh[index].targetLane + 1) && !lagRight) {
        this.veh[index].lagRight = this.veh[i];
        lagRight = true;
      }
    }
  }
  decideLC(dt) {
    this.veh.forEach(veh => {
      if (veh.targetLane <= 0) { veh.left = false; veh.targetLane = 0 };
      if (veh.targetLane >= this.nLanes - 1) { veh.right = false; veh.targetLane = this.nLanes - 1 };
      veh.decideLC(dt, this.roadLen);
      veh.left = true;
      veh.right = true;
    })
  }

  /*
*计算两点之间的距离
*@param {Float} lng1 度
*@param {Float} lat1 度
*@param {Float} lng2 度
*@param {Float} lat2 度
*return {Float} 距离
*/
  static getFlatternDistance(lng1, lat1, lng2, lat2) {
    const PI = Math.PI
    const EARTH_RADIUS = 6378137.0

    function getRad(d) {
      return d * PI / 180.0
    }
    let f = getRad((lat1 + lat2) / 2)
    let g = getRad((lat1 - lat2) / 2)
    let l = getRad((lng1 - lng2) / 2)
    let sg = Math.sin(g)
    let sl = Math.sin(l)
    let sf = Math.sin(f)

    let s, c, w, r, d, h1, h2
    let a = EARTH_RADIUS
    let fl = 1 / 298.257223563

    sg = sg * sg
    sl = sl * sl
    sf = sf * sf

    s = sg * (1 - sl) + (1 - sf) * sl
    c = (1 - sg) * (1 - sl) + sf * sl

    w = Math.atan(Math.sqrt(s / c))
    r = Math.sqrt(s * c) / w
    d = 2 * w * a
    h1 = (3 * r - 1) / 2 / c
    h2 = (3 * r + 1) / 2 / s

    return d * (1 + fl * (h1 * sf * (1 - sg) - h2 * (1 - sf) * sg))
  }
}