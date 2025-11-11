// ==UserScript==
// @name         GB Map Mineral Downloader Dropdown
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Download selected mineral polygons from GB interactive map as GeoJSON using a dropdown menu
// @author       Your Name
// @match        https://portal.minesandmineralsgb.gog.pk/interactivemap*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/bwa9365-sudo/Gb-data-/main/GB_Map_Mineral_Downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/bwa9365-sudo/Gb-data-/main/GB_Map_Mineral_Downloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    function waitForPolygons() {
        if (typeof Allpolygons !== 'undefined' && Allpolygons.length > 0) {
            showDropdown();
        } else {
            console.log('Waiting for polygons to load...');
            setTimeout(waitForPolygons, 1000);
        }
    }

    function showDropdown() {
        const mineralsSet = new Set(Allpolygons.map(d => d.polygonData.mineral.trim()));
        const minerals = Array.from(mineralsSet).sort();

        const dropdown = document.createElement('select');
        dropdown.id = 'mineralDropdown';
        dropdown.style.position = 'fixed';
        dropdown.style.top = '10px';
        dropdown.style.right = '10px';
        dropdown.style.zIndex = 9999;
        dropdown.style.padding = '5px';
        dropdown.style.fontSize = '14px';
        dropdown.style.backgroundColor = '#fff';
        dropdown.style.border = '1px solid #333';
        dropdown.style.borderRadius = '4px';

        const defaultOption = document.createElement('option');
        defaultOption.text = 'Select Mineral';
        defaultOption.value = '';
        dropdown.add(defaultOption);

        minerals.forEach(mineral => {
            const option = document.createElement('option');
            option.text = mineral;
            option.value = mineral;
            dropdown.add(option);
        });

        document.body.appendChild(dropdown);

        dropdown.addEventListener('change', function() {
            const selectedMineral = this.value;
            if (selectedMineral) downloadGeoJSON(selectedMineral);
        });
    }

    function downloadGeoJSON(targetMineral) {
        const features = Allpolygons
            .filter(data => data.polygonData.mineral.trim().toLowerCase() === targetMineral.toLowerCase())
            .map(data => {
                const polygonData = data.polygonData;
                const coords = polygonData.geo.match(/(\d+\.\d+ \d+\.\d+)/g).map(c => {
                    const [lng, lat] = c.split(' ');
                    return [parseFloat(lng), parseFloat(lat)];
                });
                return {
                    type: "Feature",
                    properties: {
                        mineral: polygonData.mineral,
                        company: polygonData.company_name,
                        status: polygonData.grantstatus
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [coords]
                    }
                };
            });

        if (features.length === 0) {
            alert(`No polygons found for ${targetMineral}.`);
            return;
        }

        const geojson = { type: "FeatureCollection", features: features };
        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${targetMineral}_GB.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`GeoJSON download triggered for ${targetMineral}!`);
    }

    waitForPolygons();
})();
