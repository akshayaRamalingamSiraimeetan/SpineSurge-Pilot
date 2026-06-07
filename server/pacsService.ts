import axios from 'axios';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import { db, sqlite } from './db';
import * as schema from './schema';

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

export interface PACSServerConfig {
    url: string;
    aet?: string;
}

export interface PACSStudy {
    studyInstanceUID: string;
    patientName: string;
    patientID: string;
    studyDate: string;
    modality: string;
    description: string;
    numberOfInstances: number;
}

export async function searchPACS(config: PACSServerConfig, query: any): Promise<PACSStudy[]> {
    const { url } = config;

    // --- Mock Support ---
    if (url === 'MOCK' || url.includes('localhost:8042')) {
        console.log("Using Mock PACS Data");
        return [
            {
                studyInstanceUID: "mock-study-1",
                patientName: "DOE^JOHN",
                patientID: "PID-123",
                studyDate: "20240115",
                modality: "CT",
                description: "CT CERVICAL SPINE",
                numberOfInstances: 240
            },
            {
                studyInstanceUID: "mock-study-2",
                patientName: "SMITH^JANE",
                patientID: "PID-456",
                studyDate: "20240210",
                modality: "MR",
                description: "MRI LUMBAR SPINE",
                numberOfInstances: 64
            }
        ].filter(s => {
            if (query.patientName && !s.patientName.includes(query.patientName.toUpperCase())) return false;
            if (query.patientID && s.patientID !== query.patientID) return false;
            return true;
        });
    }

    try {
        // QIDO-RS search studies
        const params = new URLSearchParams();
        if (query.patientName) params.append('PatientName', `*${query.patientName}*`);
        if (query.patientID) params.append('PatientID', query.patientID);
        if (query.studyDate) params.append('StudyDate', query.studyDate);

        const response = await axios.get(`${url}/studies`, {
            params,
            headers: { 'Accept': 'application/dicom+json' }
        });

        if (!response.data || !Array.isArray(response.data)) return [];

        return response.data.map((item: any) => {
            const getValue = (tag: string, subField: string = 'Value') => {
                const entry = item[tag];
                if (entry && entry[subField] && entry[subField].length > 0) {
                    const val = entry[subField][0];
                    if (typeof val === 'object' && val.Alphabetic) return val.Alphabetic;
                    return val;
                }
                return '';
            };

            return {
                studyInstanceUID: getValue('0020000D'),
                patientName: getValue('00100010'),
                patientID: getValue('00100020'),
                studyDate: getValue('00080020'),
                modality: getValue('00080060'),
                description: getValue('00081030'),
                numberOfInstances: parseInt(getValue('00201208')) || 0
            };
        });
    } catch (error: any) {
        console.error("PACS search error:", error.message);
        throw new Error(`Failed to search PACS: ${error.message}`);
    }
}

export async function importPACSStudy(config: PACSServerConfig, studyInstanceUID: string, targetPatientId: string, visitId?: string) {
    const { url } = config;

    // --- Mock Support ---
    if (url === 'MOCK' || url.includes('localhost:8042')) {
        console.log("Simulating PACS Import (Mock)");
        const studyId = `pacs-mock-${Date.now()}`;
        await db.insert(schema.studies).values({
            id: studyId,
            patientId: targetPatientId,
            visitId: visitId || null,
            modality: studyInstanceUID === 'mock-study-2' ? 'MR' : 'CT',
            source: 'PACS',
            acquisitionDate: new Date().toISOString().split('T')[0]
        });

        // Register a fake scan pointing to a generic image
        await db.insert(schema.scans).values({
            id: `scan-mock-${Date.now()}`,
            studyId: studyId,
            filePath: '90c16cab-537e-4f55-b7f2-1124948cfabc.png',
            type: 'Imported',
            date: new Date().toISOString().split('T')[0]
        });

        return { success: true, count: 1, studyId };
    }

    try {
        console.log(`Starting PACS import for Study: ${studyInstanceUID}`);

        // 1. Get Instances for the study
        const instancesResponse = await axios.get(`${url}/studies/${studyInstanceUID}/instances`, {
            headers: { 'Accept': 'application/dicom+json' }
        });

        if (!instancesResponse.data || !Array.isArray(instancesResponse.data)) {
            throw new Error("No instances found for study");
        }

        const instances = instancesResponse.data;
        const studyId = `pacs-${studyInstanceUID.slice(-8)}-${Date.now()}`;

        const firstInstance = instances[0];
        const getValue = (item: any, tag: string, subField: string = 'Value') => {
            const entry = item[tag];
            if (entry && entry[subField] && entry[subField].length > 0) return entry[subField][0];
            return '';
        };

        const studyData = {
            id: studyId,
            patientId: targetPatientId,
            visitId: visitId || null,
            modality: getValue(firstInstance, '00080060') || 'CT',
            source: 'PACS',
            acquisitionDate: getValue(firstInstance, '00080020') || new Date().toISOString().split('T')[0]
        };

        await db.insert(schema.studies).values(studyData);

        let importedCount = 0;
        const maxSlicesToImport = 15; // Increased limit
        // Select slices across the whole series
        const step = Math.max(1, Math.floor(instances.length / maxSlicesToImport));

        for (let i = 0; i < instances.length && importedCount < maxSlicesToImport; i += step) {
            const instance = instances[i];
            const seriesInstanceUID = getValue(instance, '0020000E');
            const sopInstanceUID = getValue(instance, '00080018');

            const wadoUrl = url.replace('/dicom-web', '');
            const previewUrl = `${wadoUrl}/wado?requestType=WADO&studyUID=${studyInstanceUID}&seriesUID=${seriesInstanceUID}&objectUID=${sopInstanceUID}&contentType=image/png`;

            try {
                const response = await axios.get(previewUrl, {
                    responseType: 'arraybuffer',
                    timeout: 20000
                });

                const filename = `${randomUUID()}.png`;
                const destPath = path.join(UPLOADS_DIR, filename);

                await fs.writeFile(destPath, Buffer.from(response.data));

                const scanId = `scan-pacs-${sopInstanceUID.slice(-8)}-${Date.now()}`;
                await db.insert(schema.scans).values({
                    id: scanId,
                    studyId: studyId,
                    filePath: filename,
                    type: 'Imported',
                    date: studyData.acquisitionDate
                });

                importedCount++;
            } catch (dlError: any) {
                console.warn(`Failed to import slice ${sopInstanceUID}:`, dlError.message);
            }
        }

        return { success: true, count: importedCount, studyId };
    } catch (error: any) {
        console.error("PACS import error:", error.message);
        throw new Error(`Failed to import from PACS: ${error.message}`);
    }
}
