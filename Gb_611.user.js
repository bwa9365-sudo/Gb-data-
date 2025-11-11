// ==UserScript==
// @name         GB Mines Map - COMPLETE Data Exporter v6.1 FIXED
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Export ALL GB mineral data - Fixed syntax errors
// @author       Enhanced with Data Wait
// @match        https://portal.minesandmineralsgb.gog.pk/interactivemap
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let allDataCollected = false;
    let completeDataset = [];
    let checkAttempts = 0;
    const maxAttempts = 10;

    console.log('🔧 GB Mines Map Exporter v6.1 loading...');

    function initializeExporter() {
        waitForData();
    }

    function waitForData() {
        checkAttempts++;
        
        if (typeof Allpolygons !== 'undefined' && Allpolygons.length > 0) {
            console.log('✅ Data found! Allpolygons count:', Allpolygons.length);
            completeDataset = [...Allpolygons];
            addExportButton();
            triggerAllFilters();
        } else if (checkAttempts < maxAttempts) {
            console.log('⏳ Waiting for data... attempt', checkAttempts);
            setTimeout(waitForData, 2000);
        } else {
            console.log('❌ Data not loaded after', maxAttempts, 'attempts');
            addExportButton();
        }
    }

    function triggerAllFilters() {
        console.log('🔄 Triggering all filters to load complete data...');
        setTimeout(function() {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(function(checkbox) {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    const event = new Event('change', { bubbles: true });
                    checkbox.dispatchEvent(event);
                }
            });

            setTimeout(function() {
                if (typeof Allpolygons !== 'undefined') {
                    completeDataset = getUniquePolygons();
                    allDataCollected = true;
                    console.log('✅ All data collected:', completeDataset.length, 'polygons');
                    validateDataCompleteness();
                }
            }, 3000);
        }, 1000);
    }

    function getUniquePolygons() {
        const uniqueMap = new Map();
        if (typeof Allpolygons !== 'undefined') {
            Allpolygons.forEach(function(polygon) {
                const key = polygon.polygonData.geo + polygon.polygonData.mineral + polygon.polygonData.company_name;
                uniqueMap.set(key, polygon);
            });
        }
        return Array.from(uniqueMap.values());
    }

    function addExportButton() {
        const existingBtn = document.querySelector('#gb-export-btn');
        if (existingBtn) existingBtn.remove();

        const exportBtn = document.createElement('button');
        exportBtn.id = 'gb-export-btn';
        exportBtn.innerHTML = '🗂️ Download COMPLETE Data';
        exportBtn.style.cssText = 'position: absolute; top: 100px; right: 10px; z-index: 1000; background: #2196F3; color: white; border: none; padding: 12px 16px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
        
        exportBtn.onmouseover = function() { exportBtn.style.background = '#1976D2'; };
        exportBtn.onmouseout = function() { exportBtn.style.background = '#2196F3'; };

        exportBtn.addEventListener('click', function() {
            if (completeDataset.length > 0) {
                exportCompleteDataset();
            } else if (typeof Allpolygons !== 'undefined' && Allpolygons.length > 0) {
                completeDataset = getUniquePolygons();
                exportCompleteDataset();
            } else {
                alert('Data not loaded yet. Please interact with the map and try again.');
            }
        });

        const map = document.getElementById('map');
        if (map) {
            map.appendChild(exportBtn);
            console.log('✅ Export button added to map');
        } else {
            console.log('❌ Map element not found for button');
        }
    }

    function exportCompleteDataset() {
        const dataToExport = completeDataset.length > 0 ? completeDataset : 
                           (typeof Allpolygons !== 'undefined' ? getUniquePolygons() : []);

        if (dataToExport.length === 0) {
            alert('No data available. Please wait for map to load completely.');
            return;
        }

        console.log('📤 Exporting', dataToExport.length, 'polygons...');

        const features = dataToExport.map(function(item) {
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
                    data_source: 'GB_Mines_Portal_v6.1'
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
        
        console.log('✅ Export complete!');
        console.log('📊 Summary:', features.length, 'polygons');
        
        const districts = [...new Set(features.map(function(f) { return f.properties.district; }))];
        console.log('📍 Districts:', districts);
    }

    function parseCoordinates(geoString) {
        const coords = geoString.match(/(\d+\.\d+ \d+\.\d+)/g);
        if (!coords) return [];
        return coords.map(function(coord) {
            const parts = coord.split(' ');
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            return [lat, lng];
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
        if (coords.length === 0) return 'Unknown District';
        const centerLat = coords.reduce(function(sum, c) { return sum + c[0]; }, 0) / coords.length;
        const centerLng = coords.reduce(function(sum, c) { return sum + c[1]; }, 0) / coords.length;

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

    function validateDataCompleteness() {
        if (!completeDataset.length) return;
        console.log('📊 Validation: Total polygons:', completeDataset.length);
    }

    // Start the script
    window.addEventListener('load', function() {
        setTimeout(initializeExporter, 2000);
    });
})();
