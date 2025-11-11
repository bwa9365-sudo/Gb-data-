// ==UserScript==
// @name         GB Map Top 10 Free Zones with Coordinates
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Identify top 10 potential free exploration zones in GB and show coordinates
// @author       Your Name
// @match        https://portal.minesandmineralsgb.gog.pk/interactivemap*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const takenStatuses = ['study','granted','cancelled','area'];
    const proximityThreshold = 0.05; // ~5 km
    const mineralColors = {
        'Unknown':'#7f7f7f',
        'Gold':'#FFD700',
        'Copper':'#B87333',
        'Iron':'#A52A2A',
        'Antimony':'#708090',
        'Gemstone':'#8A2BE2',
        'Coal':'#000000'
    };

    let freePolygons = [];
    let clusters = [];
    let clusterLayers = [];
    let heatLayer;

    function waitForPolygons() {
        if (typeof Allpolygons !== 'undefined' && Allpolygons.length > 0) {
            processPolygons();
        } else {
            console.log('Waiting for polygons...');
            setTimeout(waitForPolygons, 1000);
        }
    }

    function processPolygons() {
        identifyFreePolygons();
        clusterFreePolygons();
        estimatePotentialMinerals();
        calculateClusterAreas();
        clusters.sort((a,b)=>b.area-b.area);
        visualizeClusters();
        createFilterUI();
        addDownloadButton();
        showTopZones();
    }

    function identifyFreePolygons() {
        freePolygons = Allpolygons.filter(data => {
            const status = data.polygonData.grantstatus?.trim().toLowerCase() || '';
            const mineral = data.polygonData.mineral?.trim() || '';
            return !takenStatuses.includes(status) && mineral === '';
        }).map(data => {
            const coords = data.polygonData.geo.match(/(\d+\.\d+ \d+\.\d+)/g).map(c => {
                const [lng, lat] = c.split(' ');
                return [parseFloat(lat), parseFloat(lng)];
            });
            return { coords };
        });
        console.log(`Free polygons found: ${freePolygons.length}`);
    }

    function isClose(p1, p2) {
        return Math.abs(p1[0]-p2[0])<proximityThreshold && Math.abs(p1[1]-p2[1])<proximityThreshold;
    }

    function clusterFreePolygons() {
        clusters = [];
        freePolygons.forEach(p => {
            let added = false;
            for (const cluster of clusters) {
                if (p.coords.some(c1 => cluster.coords.some(c2 => isClose(c1,c2)))) {
                    cluster.coords.push(...p.coords);
                    added = true;
                    break;
                }
            }
            if(!added) clusters.push({ coords: [...p.coords] });
        });
        console.log(`Clusters formed: ${clusters.length}`);
    }

    function polygonAreaKm2(coords) {
        if (coords.length < 3) return 0;
        const R = 6371;
        let area = 0;
        for (let i=0;i<coords.length;i++){
            const [lat1,lon1] = coords[i];
            const [lat2,lon2] = coords[(i+1)%coords.length];
            area += ((lon2-lon1)*(Math.PI/180))*(2+Math.sin(lat1*Math.PI/180)+Math.sin(lat2*Math.PI/180));
        }
        return Math.abs(area*R*R/2);
    }

    function calculateClusterAreas() {
        clusters.forEach(c=>c.area=polygonAreaKm2(c.coords));
    }

    function estimatePotentialMinerals() {
        clusters.forEach(cluster=>{
            let nearbyMinerals = {};
            cluster.coords.forEach(coord=>{
                Allpolygons.forEach(data=>{
                    const mineral = data.polygonData.mineral?.trim() || '';
                    if(mineral && !takenStatuses.includes(data.polygonData.grantstatus?.trim().toLowerCase())){
                        data.polygonData.geo.match(/(\d+\.\d+ \d+\.\d+)/g).map(c=>{
                            const [lng,lat] = c.split(' ');
                            if(Math.abs(parseFloat(lat)-coord[0])<0.05 && Math.abs(parseFloat(lng)-coord[1])<0.05){
                                nearbyMinerals[mineral] = (nearbyMinerals[mineral]||0)+1;
                            }
                        });
                    }
                });
            });
            const entries = Object.entries(nearbyMinerals);
            cluster.potentialMineral = entries.length ? entries.sort((a,b)=>b[1]-a[1])[0][0] : 'Unknown';
        });
    }

    function visualizeClusters(filterMineral) {
        clusterLayers.forEach(l => map.removeLayer(l));
        if(heatLayer) map.removeLayer(heatLayer);
        clusterLayers = [];
        let heatPoints = [];

        clusters.forEach((cluster,i)=>{
            if(filterMineral && cluster.potentialMineral!==filterMineral) return;
            const color = mineralColors[cluster.potentialMineral]||'#7f7f7f';
            const layer = L.polygon(cluster.coords,{
                color:color,
                fillColor:color,
                fillOpacity:0.5
            }).bindPopup(`Cluster ${i+1}<br>Points:${cluster.coords.length}<br>Area:${cluster.area.toFixed(2)}km²<br>Potential Mineral:${cluster.potentialMineral}`)
            .addTo(map);
            clusterLayers.push(layer);
            cluster.coords.forEach(c=>heatPoints.push([c[0],c[1],1]));
        });

        if(heatPoints.length>0 && L.heatLayer){
            heatLayer = L.heatLayer(heatPoints,{radius:25,blur:15,maxZoom:10}).addTo(map);
        }
    }

    function createFilterUI() {
        const div = document.createElement('div');
        div.style.position='fixed';
        div.style.top='50px';
        div.style.right='10px';
        div.style.zIndex=9999;
        div.style.backgroundColor='rgba(255,255,255,0.9)';
        div.style.padding='10px';
        div.style.borderRadius='5px';
        div.innerHTML = '<b>Filter by Mineral:</b><br>';
        Object.keys(mineralColors).forEach(mineral=>{
            const label = document.createElement('label');
            label.style.display='block';
            label.innerHTML = `<input type="radio" name="mineralFilter" value="${mineral}"> ${mineral}`;
            div.appendChild(label);
        });
        const label = document.createElement('label');
        label.style.display='block';
        label.innerHTML = `<input type="radio" name="mineralFilter" value=""> Show All`;
        div.appendChild(label);
        document.body.appendChild(div);

        document.querySelectorAll('input[name="mineralFilter"]').forEach(radio=>{
            radio.addEventListener('change',function(){
                visualizeClusters(this.value||null);
            });
        });
    }

    function addDownloadButton() {
        const btn = document.createElement('button');
        btn.innerText='Download Free Areas (GeoJSON)';
        btn.style.position='fixed';
        btn.style.top='10px';
        btn.style.right='10px';
        btn.style.zIndex=9999;
        btn.style.padding='8px';
        btn.style.backgroundColor='#28a745';
        btn.style.color='#fff';
        btn.style.border='none';
        btn.style.borderRadius='5px';
        btn.style.cursor='pointer';
        btn.onclick=downloadGeoJSON;
        document.body.appendChild(btn);
    }

    function downloadGeoJSON() {
        const features = clusters.map((c,i)=>({
            type:"Feature",
            properties:{
                cluster:i+1,
                points:c.coords.length,
                area_km2:c.area.toFixed(2),
                potentialMineral:c.potentialMineral
            },
            geometry:{
                type:"Polygon",
                coordinates:[c.coords.map(c2=>[c2[1],c2[0]])]
            }
        }));
        const blob = new Blob([JSON.stringify({type:"FeatureCollection",features},null,2)],{type:'application/json'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='GB_Free_Areas_Potential.geojson';
        a.click();
    }

    function showTopZones() {
        const top10 = clusters.slice(0,10);
        let html=`<div style="position:fixed;bottom:10px;left:10px;z-index:9999;background:rgba(255,255,255,0.9);padding:10px;border-radius:5px;max-height:400px;overflow:auto"><b>Top 10 Free Zones:</b><br><table border="1" style="font-size:10px"><tr><th>#</th><th>Area km²</th><th>Points</th><th>Potential Mineral</th><th>Copy Coords</th></tr>`;
        top10.forEach((c,i)=>{
            const coordsStr = c.coords.map(p=>`[${p[0].toFixed(5)},${p[1].toFixed(5)}]`).join('; ');
            html+=`<tr>
            <td>${i+1}</td>
            <td>${c.area.toFixed(2)}</td>
            <td>${c.coords.length}</td>
            <td>${c.potentialMineral}</td>
            <td><button onclick="navigator.clipboard.writeText('${coordsStr}').then(()=>alert('Coordinates copied'))">Copy</button></td>
            </tr>`;
        });
        html+='</table></div>';
        const div = document.createElement('div');
        div.innerHTML=html;
        document.body.appendChild(div);
    }

    waitForPolygons();
})();
