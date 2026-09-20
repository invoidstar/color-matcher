/* Color-space helpers shared by the matcher and editor. */
(function(global){
  'use strict';
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function hex(rgb){ return '#' + rgb.map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase(); }

  function rgbToLab(rgb){
    let [r,g,b] = rgb.map(v => v/255);
    [r,g,b] = [r,g,b].map(v => v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
    let x=(r*0.4124564+g*0.3575761+b*0.1804375)/0.95047;
    let y=(r*0.2126729+g*0.7151522+b*0.0721750);
    let z=(r*0.0193339+g*0.1191920+b*0.9503041)/1.08883;
    const d=6/29, f=t => t>Math.pow(d,3) ? Math.cbrt(t) : t/(3*d*d)+4/29;
    const fx=f(x), fy=f(y), fz=f(z);
    return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
  }

  function deltaE00(lab1, lab2){
    const [L1,a1,b1]=lab1, [L2,a2,b2]=lab2;
    const avgL=(L1+L2)/2;
    const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), avgC=(C1+C2)/2;
    const G=0.5*(1-Math.sqrt(Math.pow(avgC,7)/(Math.pow(avgC,7)+Math.pow(25,7))));
    const ap1=(1+G)*a1, ap2=(1+G)*a2;
    const Cp1=Math.hypot(ap1,b1), Cp2=Math.hypot(ap2,b2), avgCp=(Cp1+Cp2)/2;
    const hp=(x,y) => { let h=Math.atan2(y,x)*180/Math.PI; return h<0?h+360:h; };
    const hp1=(Cp1===0)?0:hp(ap1,b1), hp2=(Cp2===0)?0:hp(ap2,b2);
    const dL=L2-L1, dC=Cp2-Cp1;
    let dh=0;
    if(Cp1*Cp2!==0){
      const diff=hp2-hp1;
      dh=Math.abs(diff)<=180?diff:(diff>180?diff-360:diff+360);
    }
    const dH=2*Math.sqrt(Cp1*Cp2)*Math.sin((dh/2)*Math.PI/180);
    let avgH;
    if(Cp1*Cp2===0) avgH=hp1+hp2;
    else if(Math.abs(hp1-hp2)<=180) avgH=(hp1+hp2)/2;
    else avgH=(hp1+hp2+360)/2 >= 360 ? (hp1+hp2-360)/2 : (hp1+hp2+360)/2;
    const T=1-0.17*Math.cos((avgH-30)*Math.PI/180)+0.24*Math.cos(2*avgH*Math.PI/180)+0.32*Math.cos((3*avgH+6)*Math.PI/180)-0.20*Math.cos((4*avgH-63)*Math.PI/180);
    const dTheta=30*Math.exp(-Math.pow((avgH-275)/25,2));
    const Rc=2*Math.sqrt(Math.pow(avgCp,7)/(Math.pow(avgCp,7)+Math.pow(25,7)));
    const Sl=1+0.015*Math.pow(avgL-50,2)/Math.sqrt(20+Math.pow(avgL-50,2));
    const Sc=1+0.045*avgCp, Sh=1+0.015*avgCp*T;
    const Rt=-Math.sin(2*dTheta*Math.PI/180)*Rc;
    const x=dL/Sl, y=dC/Sc, z=dH/Sh;
    return Math.sqrt(x*x+y*y+z*z+Rt*y*z);
  }

  function rgbToHsv([r,g,b]){
    r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    let h=0; if(d){ if(max===r)h=60*(((g-b)/d)%6); else if(max===g)h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
    if(h<0)h+=360; return [h, max===0?0:d/max, max];
  }


  global.PCMColor = Object.freeze({ clamp, hex, rgbToLab, deltaE00, rgbToHsv });
})(window);
