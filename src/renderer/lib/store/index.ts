import { create } from 'zustand';
import { AuthSlice, createAuthSlice } from './authSlice';
import { PatientSlice, createPatientSlice } from './patientSlice';
import { CanvasSlice, createCanvasSlice } from './canvasSlice';
import { DicomSlice, createDicomSlice } from './dicomSlice';
import { ComparisonSlice, createComparisonSlice } from './comparisonSlice';
import { ShareSlice, createShareSlice } from './shareSlice';
import { LiveShareSlice, createLiveShareSlice } from './liveShareSlice';
import { Patient, Study, Scan, Visit, Context, ContextState, UserProfile, ThreeDImplant, DICOMResource } from './types';

export type AppState = AuthSlice & PatientSlice & CanvasSlice & DicomSlice & ComparisonSlice & ShareSlice & LiveShareSlice;

export const useAppStore = create<AppState>()((...a) => ({
    ...createAuthSlice(...a),
    ...createPatientSlice(...a),
    ...createCanvasSlice(...a),
    ...createDicomSlice(...a),
    ...createComparisonSlice(...a),
    ...createShareSlice(...a),
    ...createLiveShareSlice(...a),
}));

export type { Patient, Study, Scan, Visit, Context, ContextState, UserProfile, ThreeDImplant, DICOMResource };
