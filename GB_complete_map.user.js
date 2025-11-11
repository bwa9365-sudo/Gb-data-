// ==UserScript==
// @name         GB Mines Map - COMPLETE Data Exporter v6
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Export ALL GB mineral data layers (Mining Leases + Applied + Free + Reserved Areas) with full validation
// @author       Enhanced Complete Export
// @match        https://portal.minesandmineralsgb.gog.pk/interactivemap
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let allDataCollected = false;
    let completeDataset = [];

    window.addEventListener('load', function() {
        setTimeout(initializeEnhancedExporter, 4000);
    });

    function initializeEnhancedExporter() {
        collectAllData();
        addCompleteExportButton();
        addDataMonitor();
    }

    function collectAllData() {
        if (typeof Allpolygons !== 'undefined') {
            completeDataset = [...Allpolygons];
            triggerAllDataLoad();
        }
    }

    function triggerAllDataLoad() {
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    const event = new Event('change', { bubbles: true });
                    checkbox.dispatchEvent(event);
                }
            });

            setTimeout(() => {
                completeDataset = getUniquePolygons();
                allDataCollected = true;
                console.log('All polygons collected:', completeDataset.length);
                validateDataCompleteness();
                ensureCompleteDataLoad();
            }, 2000);
        }, 1000);
    }

    function getUniquePolygons() {
        const uniqueMap = new Map();
        if (typeof Allpolygons !== 'undefined') {
            Allpolygons.forEach(polygon => {
                const key = polygon.polygonData.geo + polygon.polygonData.mineral + polygon.polygonData.company_name;
                uniqueMap.set(key, polygon);
            });
        }
        return Array.from(uniqueMap.values());
    }

    function addCompleteExportButton() {
        const exportBtn = document.createElement('button');
        exportBtn.innerHTML = '🗂️ Download COMPLETE Map Data';
        exportBtn.style.cssText = `
            position: absolute;
            top: 100px;
            right: 10px;
            z-index: 1000;
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        exportBtn.onmouseover = () => exportBtn.style.background = '#1976D2';
        exportBtn.onmouseout = () => exportBtn.style.background = '#2196F3';

        exportBtn.addEventListener('click', () => {
            if (completeDataset.length > 0) exportCompleteDataset();
            else if (typeof Allpolygons !== 'undefined' && Allpolygons.length > 0) exportCompleteDataset();
            else alert('Please wait for map data to load completely.');
        });

        const map = document.getElementById('map');
        if (map) map.appendChild(exportBtn);
    }

    function addDataMonitor() {
        const observer = new MutationObserver(() => {
            if (typeof Allpolygons !== 'undefined' && !allDataCollected) {
                completeDataset = getUniquePolygons();
                allDataCollected = true;
                console.log('Data monitoring - Total polygons:', completeDataset.length);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function exportCompleteDataset() {
        const dataToExport = completeDataset.length > 0 ? completeDataset : 
                           (typeof Allpolygons !== 'undefined' ? Allpolygons : []);

        if (dataToExport.length === 0) {
            alert('No data available to export.');
            return;
        }

        const features = dataToExport.map(item => {
            const polygonData = item.polygonData;
            const coordinates = parseCoordinates(polygonData.geo);
            
            return {
                type: "Feature",
                properties: {
                    mineral: polygonData.mineral || 'Unknown',
                    company_name: polygonData.company_name || 'N/A',
                    grant_status: polygonData.grantstatus || 'N/A',
                    area_type: classifyAreaType(polygonData),
                    district: detectDistrict(coordinates),
                    area_km2: calculatePolygonArea(coordinates).toFixed(2),
                    data_source: 'GB_Mines_Portal_Complete'
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [coordinates]
                }
            };
        });

        const geoJsonData = {
            type: "FeatureCollection",
            name: "GB_Complete_Mineral_Resources",
            features: features
        };

        downloadFile(geoJsonData, 'GB_COMPLETE_Mineral_Data_' + getTimestamp() + '.geojson');
        console.log('COMPLETE Export Summary:', features.length, 'polygons exported');
    }

    function parseCoordinates(geoString) {
        return geoString.match(/(\d+\.\d+ \d+\.\d+)/g).map(coord => {
            const [lng, lat] = coord.split(' ');
            return [parseFloat(lat), parseFloat(lng)];
        });
    }

    function classifyAreaType(polygonData) {
        const status = (polygonData.grantstatus || '').toLowerCase();
        if (status.includes('grant') || status.includes('lease')) return 'Mining Lease';
        if (status.includes('applied') || status.includes('pending')) return 'Applied Area';
        if (status.includes('reserve')) return 'Reserved Area';
        if (status.includes('study') || status.includes('research')) return 'Study Area';
        if (status.includes('free') || status === '') return 'Free Area';
        return 'Other';
    }

    function detectDistrict(coords) {
        const centerLat = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const centerLng = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

        if (centerLng > 74.5 && centerLat > 35.8) return 'Gilgit';
        if (centerLng > 74.0 && centerLat < 35.5) return 'Diamer';
        if (centerLng < 74.0 && centerLat > 36.0) return 'Hunza';
        if (centerLng > 75.0 && centerLat > 35.0) return 'Skardu';
        if (centerLng < 73.0 && centerLat > 36.0) return 'Ghizer';
        if (centerLng > 76.0) return 'Ghanche';
        if (centerLng < 72.5) return 'Nagar';
        return 'Unknown District';
    }

    function calculatePolygonArea(coords) {
        if (coords.length < 3) return 0;
        let area = 0;
        const n = coords.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coords[i][1] * coords[j][0];
            area -= coords[j][1] * coords[i][0];
        }
        return Math.abs(area) * 111.32 * 111.32 * Math.cos(coords[0][0] * Math.PI / 180) / 2;
    }

    function downloadFile(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }

    // --- NEW: Data Validation ---
    function validateDataCompleteness() {
        if (!completeDataset.length) return;

        const districts = [...new Set(completeDataset.map(p => detectDistrict(parseCoordinates(p.polygonData.geo))))];
        const minerals = [...new Set(completeDataset.map(p => p.polygonData.mineral))];
        const areaTypes = [...new Set(completeDataset.map(p => classifyAreaType(p.polygonData)))];

        console.log('📊 DATA VALIDATION REPORT:');
        console.log('Total polygons:', completeDataset.length);
        console.log('Districts found:', districts);
        console.log('Minerals found:', minerals);
        console.log('Area types found:', areaTypes);

        const diamerData = completeDataset.filter(p => detectDistrict(parseCoordinates(p.polygonData.geo)) === 'Diamer');
        console.log('Diamer district polygons:', diamerData.length);

        if (diamerData.length === 0) {
            console.warn('⚠️ No Diamer data found - dataset may be incomplete');
        }
    }

    // --- NEW: Ensure all data loads by panning map ---
    function ensureCompleteDataLoad() {
        if (!window.map) return;

        const bounds = window.map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        window.map.panTo([(ne.lat + sw.lat)/2, (ne.lng + sw.lng)/2]);

        setTimeout(() => {
            completeDataset = getUniquePolygons();
            validateDataCompleteness();
        }, 2000);
    }

    console.log('GB Mines Map COMPLETE Data Exporter v6 loaded');
})();
