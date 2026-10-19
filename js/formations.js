"use strict";

// Thousands of luminous dust grains are baked once into small layered atlases.
// Frames animate the resulting volumes, never thousands of separate draw calls.
OrbLift.installFormations = function installFormations(game) {
  const {g} = game, tau = Math.PI * 2, cache = new Map();
  const width = 320, height = 384;
  const themes = {
    void:[1,["#8d71dc","#4cbed9","#f0bcff"]],
    stars:[0,["#a5c4ff","#e2c2ff","#fff0ca"]],
    grid:[3,["#bd8aff","#56e1ed","#f8b2de"]],
    embers:[2,["#ff9d54","#ef546b","#ffe5ad"]],
    ocean:[1,["#4edbc9","#66b9ed","#c1fff5"]],
    aurora:[3,["#76eac5","#bf96ed","#c7f8ff"]],
    nebula:[3,["#eb8ce8","#94a8ff","#ffceeb"]],
    matrix:[1,["#82edb4","#6ec8b8","#e3ffbd"]],
    galaxy:[0,["#e5c2f5","#a3b9ff","#ffedc6"]],
    eclipse:[2,["#fbb484","#ee7cbd","#fff1c2"]],
    warp:[1,["#77d2ff","#9b93ff","#d3ffff"]],
    cosmic:[0,["#ffdf9b","#d6b6ff","#fff5df"]],
  };
  function bake(key, signature, colors, premium) {
    let seed = 7151;
    for (let index = 0; index < key.length; index++) seed = Math.imul(seed ^ key.charCodeAt(index),16777619);
    const random = () => {seed ^= seed << 13;seed ^= seed >>> 17;seed ^= seed << 5;return (seed >>> 0) / 4294967296;};
    const layers = [];
    for (let layer = 0; layer < 2; layer++) {
      const canvas = game.environment.document.createElement("canvas");
      canvas.width = width;canvas.height = height;
      const context = canvas.getContext("2d");
      const points = premium ? 2800 : 1900;
      // Soft gas knots sit beneath individually resolved dust, not line art.
      for (let knot = 0; knot < 9; knot++) {
        const angle = knot * 2.4, radius = 28 + knot * 9;
        const x = width * .5 + Math.cos(angle) * radius;
        const y = height * .45 + Math.sin(angle) * radius * .6;
        const glow = context.createRadialGradient(x,y,0,x,y,35 + knot * 3);
        glow.addColorStop(0,colors[knot % colors.length] + "38");
        glow.addColorStop(1,colors[knot % colors.length] + "00");
        context.fillStyle=glow;context.fillRect(x-65,y-65,130,130);
      }
      for (let index = 0; index < points; index++) {
        const progress = random(), scatter = (random()+random()+random()+random()-2);
        let x,y;
        if (signature === 0) {
          const radius = Math.pow(progress,.72)*.44;
          const angle = (index % 3)*tau/3 + radius*12 + scatter*.5;
          x=.5+Math.cos(angle)*radius;y=.45+Math.sin(angle)*radius*.57;
        } else if (signature === 1) {
          x=.5+Math.sin(progress*5.4+layer*.4)*.28+scatter*.065;
          y=.08+progress*.78+Math.sin(progress*13)*.035;
        } else if (signature === 2) {
          const angle=progress*tau;
          const radius=.27+Math.sin(angle*5+.7)*.027+Math.sin(angle*11)*.014+scatter*.027;
          x=.5+Math.cos(angle)*radius*1.25;y=.45+Math.sin(angle)*radius*.9;
        } else {
          const branch=index%4;
          x=.06+progress*.88;
          y=.23+branch*.12+Math.sin(progress*6.5+branch*.65+layer*.3)*.09+scatter*.025;
        }
        const size=.3+random()*.85+(index%41===0?.9:0);
        context.globalAlpha=.16+random()*.66;
        context.fillStyle=colors[index%colors.length];
        context.fillRect(x*width,y*height,size,size);
        if (index%47===0) {
          context.globalAlpha=.08;context.fillRect(x*width-2,y*height-2,size+4,size+4);
          context.globalAlpha=.8;context.fillStyle="#fff9ec";context.fillRect(x*width,y*height,.7,.7);
        }
      }
      layers.push(canvas);
    }
    if(cache.size>=6){const oldest=cache.keys().next().value;for(const layer of cache.get(oldest))layer.width=layer.height=1;cache.delete(oldest);}
    cache.set(key,layers);return layers;
  }
  function draw(key, signature, colors, time, w, h, alpha, premium) {
    const layers=cache.get(key)||bake(key,signature,colors,premium);
    g.save();g.globalCompositeOperation="screen";
    for(let layer=0;layer<2;layer++){
      const phase=time*(.025+layer*.012)+signature;
      g.save();g.translate(w*.5+Math.sin(phase)*w*.035,h*.34+Math.cos(phase*.8)*h*.025);
      g.rotate(Math.sin(phase*.5)*.06 + (signature===0?time*.004:0));
      const pulse=1+Math.sin(time*.15+layer)*.025;
      g.globalAlpha=alpha*(layer?.57:.8)*(.9+Math.sin(time*.7+layer)*.1);
      g.drawImage(layers[layer],-w*.59*pulse,-h*.39*pulse,w*1.18*pulse,h*.78*pulse);
      g.restore();
    }
    g.restore();
  }
  game.drawBackgroundFormation = (id,time,w,h) => {
    const [signature,colors]=themes[id]||themes.void;
    draw("background:"+id,signature,colors,time,w,h,id==="void"?.42:.77,["galaxy","eclipse","warp","cosmic"].includes(id));
  };
  game.drawZoneFormation = (definition,index,time,w,h,weight) => {
    const rgb = definition.color.map(value=>Math.round(value).toString(16).padStart(2,"0")).join("");
    // Hex colors keep baked alpha knots portable across Canvas implementations.
    const colors=["#"+rgb,"#d6c5ff","#fff1c4"];
    draw("zone:"+index,index%4,colors,time*(definition.motion??1),w,h,weight*.3,true);
  };
  game.disposeFormations = () => {
    for(const layers of cache.values())for(const layer of layers)layer.width=layer.height=1;
    cache.clear();
  };
};
