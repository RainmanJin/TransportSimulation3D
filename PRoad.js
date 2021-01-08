//PassRoad，在中间车辆经过的行车道
class PRoad extends Road{
    constructor(geom,ID,nlanes,laneWidth,dataSource){
        super(geom,ID,nlanes,laneWidth,dataSource);
        this.type = 'PassRoad';
    }
}