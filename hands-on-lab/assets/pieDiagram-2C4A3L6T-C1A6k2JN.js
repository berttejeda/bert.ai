import{p as H}from"./chunk-6ZKBGPIT-BtuWgFzI.js";import{p as J}from"./wardley-L42UT6IY-YAZPMKU5-DkasL3VI.js";import{K as Q,aC as Y,L as tt,aD as et,O as at,aF as it,b as s,af as w,N as rt,q as st,aA as nt,al as ot,e as L,ak as lt,B as ct,r as dt,an as pt,G as gt}from"./Mermaid.vue_vue_type_script_setup_true_lang-BIp4B831.js";import"./index-DivCRVeJ.js";import"./modules/vue-DvMVvspN.js";import"./modules/shiki-CIbaOhkN.js";import"./modules/file-saver-B8IIMB9x.js";var ht=gt.pie,C={sections:new Map,showData:!1},u=C.sections,D=C.showData,ut=structuredClone(ht),ft=s(()=>structuredClone(ut),"getConfig"),mt=s(()=>{u=new Map,D=C.showData,dt()},"clear"),vt=s(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);u.has(t)||(u.set(t,a),w.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),xt=s(()=>u,"getSections"),St=s(t=>{D=t},"setShowData"),wt=s(()=>D,"getShowData"),M={getConfig:ft,clear:mt,setDiagramTitle:it,getDiagramTitle:at,setAccTitle:et,getAccTitle:tt,setAccDescription:Y,getAccDescription:Q,addSection:vt,getSections:xt,setShowData:St,getShowData:wt},Ct=s((t,a)=>{H(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),Dt={parse:s(async t=>{const a=await J("pie",t);w.debug(a),Ct(a,M)},"parse")},$t=s(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),yt=$t,Tt=s(t=>{const a=[...t.values()].reduce((r,o)=>r+o,0),$=[...t.entries()].map(([r,o])=>({label:r,value:o})).filter(r=>r.value/a*100>=1);return pt().value(r=>r.value).sort(null)($)},"createPieArcs"),At=s((t,a,$,y)=>{var z;w.debug(`rendering pie chart
`+t);const r=y.db,o=rt(),T=st(r.getConfig(),o.pie),A=40,n=18,p=4,c=450,d=c,f=nt(a),l=f.append("g");l.attr("transform","translate("+d/2+","+c/2+")");const{themeVariables:i}=o;let[_]=ot(i.pieOuterStrokeWidth);_??(_=2);const b=T.textPosition,g=Math.min(d,c)/2-A,B=L().innerRadius(0).outerRadius(g),O=L().innerRadius(g*b).outerRadius(g*b);l.append("circle").attr("cx",0).attr("cy",0).attr("r",g+_/2).attr("class","pieOuterCircle");const h=r.getSections(),N=Tt(h),P=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12];let m=0;h.forEach(e=>{m+=e});const k=N.filter(e=>(e.data.value/m*100).toFixed(0)!=="0"),v=lt(P).domain([...h.keys()]);l.selectAll("mySlices").data(k).enter().append("path").attr("d",B).attr("fill",e=>v(e.data.label)).attr("class","pieCircle"),l.selectAll("mySlices").data(k).enter().append("text").text(e=>(e.data.value/m*100).toFixed(0)+"%").attr("transform",e=>"translate("+O.centroid(e)+")").style("text-anchor","middle").attr("class","slice");const I=l.append("text").text(r.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText"),E=[...h.entries()].map(([e,S])=>({label:e,value:S})),x=l.selectAll(".legend").data(E).enter().append("g").attr("class","legend").attr("transform",(e,S)=>{const G=n+p,X=G*E.length/2,Z=12*n,j=S*G-X;return"translate("+Z+","+j+")"});x.append("rect").attr("width",n).attr("height",n).style("fill",e=>v(e.label)).style("stroke",e=>v(e.label)),x.append("text").attr("x",n+p).attr("y",n-p).text(e=>r.getShowData()?`${e.label} [${e.value}]`:e.label);const U=Math.max(...x.selectAll("text").nodes().map(e=>(e==null?void 0:e.getBoundingClientRect().width)??0)),q=d+A+n+p+U,R=((z=I.node())==null?void 0:z.getBoundingClientRect().width)??0,K=d/2-R/2,V=d/2+R/2,F=Math.min(0,K),W=Math.max(q,V)-F;f.attr("viewBox",`${F} 0 ${W} ${c}`),ct(f,c,W,T.useMaxWidth)},"draw"),_t={draw:At},Lt={parser:Dt,db:M,renderer:_t,styles:yt};export{Lt as diagram};
