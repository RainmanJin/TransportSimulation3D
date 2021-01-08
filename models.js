//模拟路口前禁止换道的长度
const LimitDistance = 5;

const MOBIL_mandat_bSafe = 20; // *mandat for addtl LCModelMandatoryRight/Left
const MOBIL_mandat_bThr = -20;   // to be specified below
const MOBIL_mandat_p = 0;
// const MOBIL_mandat_bias = 42;

class MOBIL {
    /**
    generalized lane-changing model MOBIL:
    at present no politeness but speed dependent safe deceleration
    
    @param bSafe:          safe deceleration [m/s^2] at maximum speed v=v0
    @param bSafeMax:       safe deceleration [m/s^2]  at speed zero (gen. higher)
    @param p:              politeness factor (0=egoistic driving)
    @param bThr:           lane-changing threshold [m/s^2] 原值0.2
    @param bBiasRight:     bias [m/s^2] to the right
    @param targetLanePrio: vehicles on target lane have priority
    @return:               MOBIL instance (constructor)
    */
    constructor(bSafe = 4, bSafeMax = 9, p = 0.05, bThr = 0.5) {
        this.bSafe = bSafe;
        this.bSafeMax = bSafeMax;
        this.p = p;
        this.bThr = bThr;
        this.bSafeReset = bSafe;
        this.bSafeMaxReset = bSafeMax;
        this.pReset = p;
        this.bThrReset = bThr;
    }
    /**
    generalized MOBIL lane chaning decision
    with bSafe increasing with decrease vrel=v/v0
    but at present w/o politeness
    
    @param vrel:            v/v0; increase bSave with decreasing vrel
    @param acc:             own acceleration at old lane
    @param accNew:          prospective own acceleration at new lane
    @param accLagNew:       prospective accel of new leader
    @param toRight:         1 if true, 0 if not
    @return: whether an immediate lane change is safe and desired
    */
    estimateLC(vrel, acc, accNew, accLag, accLagNew) {

        // safety criterion

        var bSafeActual = vrel * this.bSafe + (1 - vrel) * this.bSafeMax;
        //if(accLagNew<-bSafeActual){return false;} //!! <jun19
        //if((accLagNew<-bSafeActual)&&(signRight*this.bBiasRight<41)){return false;}//!!! override safety criterion to really enforce overtaking ban OPTIMIZE

        if (accLagNew < -bSafeActual) { return false; }//!!!

        // incentive criterion

        var dacc = accNew - acc + this.p * (accLagNew - accLag) - this.bThr;//!! new

        return (dacc > 0);
    }
    //参数改为强制换道模型
    setMandatory() {
        this.bSafe = MOBIL_mandat_bSafe;
        this.p = MOBIL_mandat_p;
        this.bThr = MOBIL_mandat_bThr;
    }
    //参数重置回正常值
    reset() {
        this.bSafe = this.bSafeReset;
        this.bSafeMax = this.bSafeMaxReset;
        this.p = this.pReset;
        this.bThr = this.bThrReset;
    }
}

class ACC {
    /**
    MT 2016: longitudinal model ACC: Has same parameters as IDM
    but exactly triangular steady state and "cooler" reactions if gap too small
    
    INFO on (no) overloading: see longModel-IDM constructor
    
    @param v:     desired speed [m/s]
    @param T:     desired time gap [s]
    @param s0:    minimum gap [m]
    @param a:     maximum acceleration [m/s^2]
    @param b:     comfortable deceleration [m/s^2]
    
    @return:      ACC instance (constructor)
    */
    constructor(v0 = 20, T = 1.3, s0 = 2, a = 1, b = 2) {
        this.v0 = v0;
        this.T = T;
        this.s0 = s0;
        this.a = a;
        this.b = b;

        this.cool = 0.99;
        this.alpha_v0 = 1; // multiplicator for temporary reduction

        this.speedlimit = 1000; // if effective speed limits, speedlimit<v0  
        this.speedmax = 1000; // if vehicle restricts speed, speedmax<speedlimit, v0
        this.bmax = 18;
    }
    /**
    ACC acceleration function
    
    @param s:     actual gap [m]
    @param v:     actual speed [m/s]
    @param vl:    leading speed [m/s]
    @param al:    leading acceleration [m/s^2] (optional; al=0 if 3 args)
    
    @return:  acceleration [m/s^2]
    */
    calcAcc(s, v, vl, al) { // this works as well

        if (s < 0.001) { return -this.bmax; }// particularly for s<0

        // !!! acceleration noise to avoid some artifacts (no noise if s<s0)
        // sig_speedFluct=noiseAcc*sqrt(t*dt/12)

        var noiseAcc = (s < this.s0) ? 0 : 0.3;    // ? 0 : 0.3; 
        var accRnd = noiseAcc * (Math.random() - 0.5);

        // determine valid local v0

        var v0eff = Math.min(this.v0, this.speedlimit, this.speedmax);
        v0eff *= this.alpha_v0;

        // actual acceleration model

        // !!! no strong response for v>v0
        //var accFree=(v<v0eff) ? this.a*(1-Math.pow(v/v0eff,4))
        //  : this.a*(1-v/v0eff); 

        // !!! strong response wanted for baWue application (dec19)
        var accFree = this.a * (1 - Math.pow(v / v0eff, 4));

        var sstar = this.s0
            + Math.max(0, v * this.T + 0.5 * v * (v - vl) / Math.sqrt(this.a * this.b));
        var accInt = -this.a * Math.pow(sstar / Math.max(s, this.s0), 2);

        //var accIDM=accFree+accInt; //!!! normal IDM
        var accIDM = Math.min(accFree, this.a + accInt); //!!! IDM+

        var accCAH = (vl * (v - vl) < -2 * s * al)
            ? v * v * al / (vl * vl - 2 * s * al)
            : al - Math.pow(v - vl, 2) / (2 * Math.max(s, 0.01)) * ((v > vl) ? 1 : 0);
        accCAH = Math.min(accCAH, this.a);

        var accMix = (accIDM > accCAH)
            ? accIDM
            : accCAH + this.b * Math.tanh((accIDM - accCAH) / this.b);
        var arg = (accIDM - accCAH) / this.b;

        var accACC = this.cool * accMix + (1 - this.cool) * accIDM;

        var accReturn = (v0eff < 0.00001) ? 0 : Math.max(-this.bmax, accACC + accRnd);

        // log and return

        //if(this.alpha_v0<0.6){ // alpha not yet used
        return accReturn;

    }//ACC.prototype.calcAcc
    reset(normalSpeed) {
        this.v0 = normalSpeed;
    }
}