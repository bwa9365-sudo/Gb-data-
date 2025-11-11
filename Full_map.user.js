// ==UserScript==
// @name         GB Mines Map - Data Exporter FIXED
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Export GB mineral data - Properly handles undefined Allpolygons
// @author       Fixed Version
// @match        https://portal.minesandmineralsgb.gog.pk/interactivemap
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('GB Mines Map Exporter loading...');

    function initializeExporter() {
        // First, add the button immediately
        addExportButton();
        
        // Then wait for data to load
        waitForData();
    }

    function waitForData(attempt = 1) {
        console.log('Checking for data... attempt', attempt);
        
        if (window.Allpolygons && window.Allpolygons.length > 0) {
            console.log('✅ Data found! Allpolygons count:', window.Allpolygons.length);
            updateButtonStatus('ready');
        } else if (attempt < 20) { // Try for up to 40 seconds
            setTimeout(function() {
                waitForData(attempt + 1);
            }, 2000);
        } else {
            console.log('❌ Data not loaded after 20 attempts');
            updateButtonStatus('no-data');
        }
    }

    function addExportButton() {
        // Remove existing button if any
        const existingBtn = document.querySelector('#gb-export-btn');
        if (existingBtn) existingBtn.remove();

        const exportBtn = document.createElement('button');
        exportBtn.id = 'gb-export-btn';
        exportBtn.innerHTML = '📥 Download Data (Waiting...)';
        exportBtn.style.cssText = 'position: absolute; top: 100px; right: 10px; z-index: 1000; background: #666; color: white; border: none; padding: 12px 16px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
        
        exportBtn.addEventListener('click', function() {
            if (window.Allpolygons && window.Allpolygons.length > 0) {
                exportData();
            } else {
                alert('Data not loaded yet. Please wait or interact with the map.');
            }
        });

        const map = document.getElementById('map');
        if (map) {
            map.appendChild(exportBtn);
            console.log('✅ Export button added to map');
        }
    }

    function updateButtonStatus(status) {
        const btn = document.querySelector('#gb-export-btn');
        if (!btn) return;
        
        if (status === 'ready') {
            btn.innerHTML = '📥 Download COMPLETE Data';
            btn.style.background = '#2196F3';
            btn.onmouseover = function() { btn.style.background = '#1976D2'; };
            btn.onmouseout = function() { btn.style.background = '#2196F3'; };
        } else if (status === 'no-data') {
            btn.innerHTML = '📥 Try Download Anyway';
            btn.style.background = '#FF9800';
        }
    }

    function exportData() {
        if (!window.Allpolygons || window.Allpolygons.length === 0) {
            alert('No data available to export.');
            return;
        }

        console.log('Starting export with', window.Allpolygons.length, 'polygons');

        try {
            const features = [];
            
            for (let i = 0; i < window.Allpolygons.length; i++) {
                const item = window.Allpolygons[i];
                const polygonData = item.polygonData;
                
                // Parse coordinates safely
                const coordinates = parseCoordinates(polygonData.geo);
                if (coordinates.length === 0) continue;
                
                const feature = {
                    type: "Feature",
                    properties: {
                        mineral: polygonData.mineral || 'Unknown',
                        company_name: polygonData.company_name || 'N/A',
                        grant_status: polygonData.grantstatus || 'N/A',
                        area_type: classifyAreaType(polygonData),
                        district: detectDistrict(coordinates),
                        area_km2: calculatePolygonArea(coordinates).toFixed(2)
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [coordinates]
                    }
                };
                
                features.push(feature);
            }

            const geoJsonData = {
                type: "FeatureCollection",
                name: "GB_Mineral_Data",
                features: features
            };

            downloadFile(geoJsonData, 'GB_Mineral_Data_' + getTimestamp() + '.geojson');
            
            console.log('✅ Export complete! Total features:', features.length);
            alert('Export completed! Downloaded ' + features.length + ' polygons.');
            
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
        }
    }

    function parseCoordinates(geoString) {
        if (!geoString) return [];
        const coordMatches = geoString.match(/(\d+\.\d+ \d+\.\d+)/g);
        if (!coordMatches) return [];
        
        const coordinates = [];
        for (let i = 0; i < coordMatches.length; i++) {
            const parts = coordMatches[i].split(' ');
            if (parts.length === 2) {
                const lat = parseFloat(parts[1]);
                const lng = parseFloat(parts[0]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    coordinates.push([lat, lng]);
                }
            }
        }
        return coordinates;
    }

    function classifyAreaType(polygonData) {
        if (!polygonData || !polygonData.grantstatus) return 'Unknown';
        const status = polygonData.grantstatus.toLowerCase();
        if (status.includes('grant') || status.includes('lease')) return 'Mining Lease';
        if (status.includes('applied') || status.includes('pending')) return 'Applied Area';
        if (status.includes('reserve')) return 'Reserved Area';
        if (status.includes('study') || status.includes('research')) return 'Study Area';
        if (status.includes('free')) return 'Free Area';
        return 'Other';
    }

    function detectDistrict(coords) {
        if (coords.length === 0) return 'Unknown';
        let totalLat = 0;
        let totalLng = 0;
        
        for (let i = 0; i < coords.length; i++) {
            totalLat += coords[i][0];
            totalLng += coords[i][1];
        }
        
        const centerLat = totalLat / coords.length;
        const centerLng = totalLng / coords.length;

        if (centerLng > 74.5 && centerLat > 35.8) return 'Gilgit';
        if (centerLng > 74.0 && centerLat < 35.5) return 'Diamer';
        if (centerLng < 74.0 && centerLat > 36.0) return 'Hunza';
        if (centerLng > 75.0 && centerLat > 35.0) return 'Skardu';
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
        const now = new Date();
        return now.getFullYear() + '-' + 
               (now.getMonth() + 1).toString().padStart(2, '0') + '-' + 
               now.getDate().toString().padStart(2, '0') + '_' + 
               now.getHours().toString().padStart(2, '0') + '-' + 
               now.getMinutes().toString().padStart(2, '0');
    }

    // Start the script
    setTimeout(initializeExporter, 3000);
})();
