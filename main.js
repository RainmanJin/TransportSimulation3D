(function () {
  "use strict";

  var url = "http://mt1.google.cn/vt/lyrs=s&hl=zh-CN&x={x}&y={y}&z={z}&s=Gali";
  var Google = new Cesium.UrlTemplateImageryProvider({ url: url })

  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YzY4OGIwNC0xNjZmLTQyNWMtYWYwYS02MjRlNWI4OGNlODYiLCJpZCI6MjE1MTgsInNjb3BlcyI6WyJhc3IiLCJnYyJdLCJpYXQiOjE1Nzk3Njc5MjN9.fnSG47ptaWVfIh0BZAFfBMRXTEzuxtQaq934VG3VnDY';
  var viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,
    imageryProvider: Google,
    terrainProvider: new Cesium.CesiumTerrainProvider({
      url: './WuhanTerrainTif'
    }),
    //这个属性不知道是不是动画必需
    shouldAnimate: true,
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(1, 8, 15, 12));

  viewer.camera.setView({
    destination: new Cesium.Cartesian3(-2275783.681494186, 5007546.201609483, 3219163.7140619),
    orientation: {
      heading: 0.07539840698422129, // east, default value is 0.0 (north)
      pitch: -0.8539035894161433,    // default value (looking down)
      roll: 0.0                             // default value
    }
  });

  var lightModelMatrix;
  // 设置模型位置
  var fixedFrameTransform = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(114.440945, 30.511604, 0));
  var lightTranslation = new Cesium.Cartesian3(235, 189.5, 0);
  //按米调整位置，设为（0，0，0）则在初始位置(240,182,1)

  lightModelMatrix = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(-85)), lightTranslation);// 局部坐标变换，Cesium.Math.toRadians(28)28是绕Z轴旋转角度
  Cesium.Matrix4.multiplyTransformation(fixedFrameTransform, lightModelMatrix, lightModelMatrix);

  var building = viewer.scene.primitives.add(Cesium.Model.fromGltf({
    url: './models/buildings/TRoad.gltf',
    modelMatrix: lightModelMatrix,
    scale: 1.8,
    maximumScreenSpaceError: 16 // default value
  }));

  var roadNetwork;
  $.ajax({
    url: "http://localhost/db",
    dataType: "json",
    success: (data) => {
      roadNetwork = new RoadNetwork(data, viewer);
    },
    async: false,//取消异步，一般不建议，以后可能修改
  });

  var clock = viewer.clock;
  var lastUpdated = clock.currentTime;
  clock.onTick.addEventListener(function () {
    var currentTime = clock.currentTime;
    var dt = Cesium.JulianDate.secondsDifference(currentTime, lastUpdated);
    if (dt == 0) { return; }
    roadNetwork.update(currentTime, dt);
    lastUpdated = clock.currentTime;
  })
}());